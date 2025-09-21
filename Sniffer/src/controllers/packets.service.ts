import { ResponseI, ComputerI } from "../models/response.interface";
import { SnifferService } from "./sniffer.service";

interface SeenPacket {
  sequenceNumber: number;
  Payloadlength: number;
}

interface TcpConnectionInfo {
  sourceIp: string;
  destinationIp: string;
  sourcePort: number;
  destinationPort: number;
  sentPackets: Map<number, number>;
}

export class PacketsService {
  buffer: Buffer<ArrayBuffer>;
  linkType: string;
  decoders: any;
  mappedDevices: ComputerI[];
  retornoFront: ResponseI;
  private readonly tcpConnections: Map<string, TcpConnectionInfo>;
  qtdPacketsResend: number;

  constructor(
    buffer: Buffer<ArrayBuffer>,
    linkType: string,
    decoders: any,
    mappedDevices: ComputerI[],
    retornoFront: ResponseI,
    qtdPacketsResend: number
  ) {
    this.buffer = buffer;
    this.linkType = linkType;
    this.decoders = decoders;
    this.mappedDevices = mappedDevices;
    this.retornoFront = retornoFront;
    this.tcpConnections = new Map<string, TcpConnectionInfo>();
    this.qtdPacketsResend = qtdPacketsResend;
  }

  processPacket(): {
    macInfo: string;
    ipv4Info: { ipSrc: string; ipDst: string; totalLen: number };
  } {
    let macInfo: string = "";
    let ipv4Info = { ipSrc: "", ipDst: "", totalLen: 0 };

    const eth = this.decoders.Ethernet(this.buffer);

    macInfo = eth.info.srcmac;

    if (eth.info.type === this.decoders.PROTOCOL.ETHERNET.IPV4) {
      const ip = this.decoders.IPV4(this.buffer, eth.offset);

      ipv4Info.ipSrc = ip.info.srcaddr;
      ipv4Info.ipDst = ip.info.dstaddr;
      ipv4Info.totalLen = ip.info.totallen;

      if (ip.info.protocol === this.decoders.PROTOCOL.IP.TCP) {
        const tcp = this.decoders.TCP(this.buffer, ip.offset);
        this.retornoFront.protocols.tcp++;

        // Create a single, consistent key for the connection, regardless of direction.
        // This allows us to track packets sent by both sides.
        let connectionKey;
        if (ipv4Info.ipSrc < ipv4Info.ipDst) {
          connectionKey = `${ipv4Info.ipSrc}:${tcp.info.srcport}-${ipv4Info.ipDst}:${tcp.info.dstport}`;
        } else {
          connectionKey = `${ipv4Info.ipDst}:${tcp.info.dstport}-${ipv4Info.ipSrc}:${tcp.info.srcport}`;
        }

        const tcpPayloadLength = ipv4Info.totalLen - ip.hdrlen - tcp.hdrlen;

        // Attempt to retrieve the existing connection
        let connection = this.tcpConnections.get(connectionKey);

        // If the connection doesn't exist, create a new one
        if (!connection) {
          connection = {
            sourceIp: ipv4Info.ipSrc,
            destinationIp: ipv4Info.ipDst,
            sourcePort: tcp.info.srcport,
            destinationPort: tcp.info.dstport,
            sentPackets: new Map<number, number>(),
          };
          this.tcpConnections.set(connectionKey, connection);
        }

        // Check for retransmission
        if (connection.sentPackets.has(tcp.info.seqno) && connection.sentPackets.get(tcp.info.seqno) === tcpPayloadLength) {
          this.qtdPacketsResend++;
        } else {
          connection.sentPackets.set(tcp.info.seqno, tcpPayloadLength);
        }

        // Verifica se o pacote TCP é um RST (pacote perdido)
        if (tcp.info.flags.reset) {
          this.retornoFront.qtdPacotesPerdidos++;
        }

        // if (tcp.info.flags.syn && tcp.info.flags.ack) {
        //   // Pacote SYN-ACK, parte do handshake
        // } else if (tcp.info.flags.syn) {
        //   // Pacote SYN, início de uma nova conexão
        // } else if (tcp.info.flags.ack) {
        //   // Pacote ACK, parte do handshake ou confirmação de dados
        // } else if (tcp.info.flags.fin) {
        //   // Pacote FIN, término de conexão
        // } else if (tcp.info.flags.psh) {
        //   // Pacote PSH, dados sendo enviados
        // }

        // Define tipo de pacote
        switch ((tcp.info.dstport, tcp.info.srcport)) {
          case 80:
            this.retornoFront.protocols.http++;
            break;
          case 443:
            this.retornoFront.protocols.https++;
            break;
          case 20:
          case 21:
            this.retornoFront.protocols.ftp++;
            break;
          default:
            this.retornoFront.protocols.other++;
            break;
        }
      } else if (ip.info.protocol === this.decoders.PROTOCOL.IP.UDP) {
        const udp = this.decoders.UDP(this.buffer, ip.offset);
        this.retornoFront.protocols.udp++;

        // Define tipo de pacote
        switch ((udp.info.dstport, udp.info.srcport)) {
          case 80:
            this.retornoFront.protocols.http++;
            break;
          case 443:
            this.retornoFront.protocols.https++;
            break;
          case 20:
          case 21:
            this.retornoFront.protocols.ftp++;
            break;
          default:
            this.retornoFront.protocols.other++;
            break;
        }
      }
    }

    console.log(`Qtd PacotesResend ${this.qtdPacketsResend}`);
    this.assignMacToDevice(macInfo, ipv4Info);
    this.updateDevicePacketCount(ipv4Info);
    return { macInfo, ipv4Info };
  }

  private assignMacToDevice(
    macInfo: string,
    ipv4Info: { ipSrc: string; ipDst: string }
  ) {
    this.mappedDevices.forEach((d) => {
      if (!d.mac && d.ipv4.includes(ipv4Info.ipSrc)) {
        d.mac = macInfo;
      }
    }); // atribui mac a endereço IPv4 correspondente
  }

  private updateDevicePacketCount(ipv4Info: { ipSrc: string; ipDst: string }) {
    // Procura o dispositivo mapeado que corresponde ao IP de origem
    const sourceDevice = this.mappedDevices.find((dev) =>
      dev.ipv4.includes(ipv4Info.ipSrc)
    );
    if (sourceDevice) {
      sourceDevice.packetsOut++;
    }

    // Procura o dispositivo mapeado que corresponde ao IP de destino
    const destDevice = this.mappedDevices.find((dev) =>
      dev.ipv4.includes(ipv4Info.ipDst)
    );
    if (destDevice) {
      destDevice.packetsIn++;
    }
  }

  static resetProperties(retornoFront: ResponseI) {
    retornoFront.taxaTráfego = 0;
    retornoFront.protocols.ftp = 0;
    retornoFront.protocols.http = 0;
    retornoFront.protocols.https = 0;
    retornoFront.protocols.tcp = 0;
    retornoFront.protocols.udp = 0;
    retornoFront.qtdPacotesPerdidos = 0;
    retornoFront.qtdPacotesReenviados = 0;
    retornoFront.inputOutput.input = 0;
    retornoFront.inputOutput.output = 0;
    retornoFront.protocols.other = 0;
  }

  public packetsResend(qtdPackets: number) {
    console.log(`QtdPacotes2 ${this.qtdPacketsResend}`);
    if (this.qtdPacketsResend === 0 || qtdPackets === 0) {
      this.retornoFront.qtdPacotesReenviados = 0;
      this.qtdPacketsResend = 0;
    } else {
      console.log(`PacotesTotais: ${qtdPackets}`);
      console.log(`PacotesReenviados: ${this.qtdPacketsResend}`);
      this.retornoFront.qtdPacotesReenviados =
        (this.qtdPacketsResend / qtdPackets) * 100;
      console.log(this.retornoFront.qtdPacotesReenviados);
      this.qtdPacketsResend = 0;
    }
  }

  public resetConnections(): void {
    this.tcpConnections.clear();
  }

  public updateInputOutput(): void {
    let totalInput = 0;
    let totalOutput = 0;

    this.mappedDevices.forEach(device => {
      totalInput += device.packetsIn;
      totalOutput += device.packetsOut;
    });

    this.retornoFront.inputOutput.input = totalInput;
    this.retornoFront.inputOutput.output = totalOutput;
  }

}

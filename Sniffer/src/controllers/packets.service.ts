import { ResponseI, ComputerI } from "../models/response.interface";

interface SeenPacket {
  sequenceNumber: number;
  payloadLength: number;
}

interface TcpConnectionInfo {
  sourceIp: string;
  destinationIp: string;
  sourcePort: number;
  destinationPort: number;
  seenPackets: Set<string>; // Usa um Set para armazenar chaves únicas de pacotes vistos
}

export class PacketsService {
  buffer: Buffer<ArrayBuffer>;
  linkType: string;
  decoders: any;
  mappedDevices: ComputerI[];
  retornoFront: ResponseI;
  private readonly tcpConnections: Map<string, TcpConnectionInfo>;

  constructor(
    buffer: Buffer<ArrayBuffer>,
    linkType: string,
    decoders: any,
    mappedDevices: ComputerI[],
    retornoFront: ResponseI
  ) {
    this.buffer = buffer;
    this.linkType = linkType;
    this.decoders = decoders;
    this.mappedDevices = mappedDevices;
    this.retornoFront = retornoFront;
    this.tcpConnections = new Map<string, TcpConnectionInfo>();
  }

  processPacket(): { macInfo: string; ipv4Info: { ipSrc: string, ipDst: string, totalLen: number } } {
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

        const connectionKey = `${ip.info.srcaddr}:${tcp.info.srcport}-${ip.info.dstaddr}:${tcp.info.dstport}`;
        const packetIdentifier = `${tcp.info.seqnum}:${tcp.info.payloadLen}`;

        let connection = this.tcpConnections.get(connectionKey);

        if (!connection) {
          connection = {
            sourceIp: ip.info.srcaddr,
            destinationIp: ip.info.dstaddr,
            sourcePort: tcp.info.srcport,
            destinationPort: tcp.info.dstport,
            seenPackets: new Set<string>(),
          };
          this.tcpConnections.set(connectionKey, connection);
        }

        if (connection.seenPackets.has(packetIdentifier)) {
          this.retornoFront.qtdPacotesReenviados++;
        } else {
          connection.seenPackets.add(packetIdentifier);
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

        // Verifica se o pacote TCP foi retransmitido
        if (tcp.info.seqnum < tcp.info.acknum) {
          this.retornoFront.qtdPacotesReenviados++;
        }

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
    retornoFront.taxaTráfego = 0
    retornoFront.protocols.ftp = 0
    retornoFront.protocols.http = 0
    retornoFront.protocols.https = 0
    retornoFront.protocols.tcp = 0
    retornoFront.protocols.udp = 0
    retornoFront.qtdPacotesPerdidos = 0
    retornoFront.qtdPacotesReenviados = 0
    retornoFront.inputOutput.input = 0
    retornoFront.inputOutput.output = 0
    retornoFront.protocols.other = 0
  }

  public resetConnections(): void {
    this.tcpConnections.clear();
  }

}

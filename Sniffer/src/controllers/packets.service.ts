import {
  ResponseI,
  ComputerI,
  TcpConnectionInfoI,
} from "../models/response.interface";

export class PacketsService {
  buffer: Buffer<ArrayBuffer>;
  linkType: string;
  decoders: any;
  mappedDevices: ComputerI[];
  retornoFront: ResponseI;
  tcpConnections: Map<string, TcpConnectionInfoI>;
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
    this.tcpConnections = new Map();
    this.qtdPacketsResend = qtdPacketsResend;
  }

  public processPacket(): void {
    let ipv4Info = { ipSrc: "", ipDst: "", totalLen: 0 };

    const eth = this.decoders.Ethernet(this.buffer);

    if (eth.info.type === this.decoders.PROTOCOL.ETHERNET.IPV4) {
      const ip = this.decoders.IPV4(this.buffer, eth.offset);

      ipv4Info.ipSrc = ip.info.srcaddr;
      ipv4Info.ipDst = ip.info.dstaddr;
      ipv4Info.totalLen = ip.info.totallen;

      if (ip.info.protocol === this.decoders.PROTOCOL.IP.TCP) {
        this._processTcpPacket(ip, ipv4Info);
      } else if (ip.info.protocol === this.decoders.PROTOCOL.IP.UDP) {
        this._processUdpPacket(ip, ipv4Info);
      }
    }

    console.log(`Qtd PacotesResend ${this.qtdPacketsResend}`);
    this.assignMacToDevice(eth.info.srcmac, ipv4Info);
    this.updateDevicePacketCount(ipv4Info);
    this.retornoFront.taxaTráfego =
      this.retornoFront.taxaTráfego + ipv4Info.totalLen;
  }

  private _processTcpPacket(
    ip: any,
    ipv4Info: { ipSrc: string; ipDst: string; totalLen: number }
  ): void {
    const tcp = this.decoders.TCP(this.buffer, ip.offset);
    this.retornoFront.protocols.tcp++;
    this.retornoFront.computers.find(
      (device) =>
        device.ipv4.includes(ipv4Info.ipSrc) ||
        device.ipv4.includes(ipv4Info.ipDst)
    )!.protocols.tcp++;

    let connectionKey;
    if (ipv4Info.ipSrc < ipv4Info.ipDst) {
      connectionKey = `${ipv4Info.ipSrc}:${tcp.info.srcport}-${ipv4Info.ipDst}:${tcp.info.dstport}`;
    } else {
      connectionKey = `${ipv4Info.ipDst}:${tcp.info.dstport}-${ipv4Info.ipSrc}:${tcp.info.srcport}`;
    }

    let connection = this.tcpConnections.get(connectionKey);

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

    const tcpPayloadLength = ipv4Info.totalLen - ip.hdrlen - tcp.hdrlen;

    if (
      connection.sentPackets.has(tcp.info.seqno) &&
      connection.sentPackets.get(tcp.info.seqno) === tcpPayloadLength
    ) {
      this.qtdPacketsResend++;
    } else {
      connection.sentPackets.set(tcp.info.seqno, tcpPayloadLength);
    }

    // Verifica se o pacote TCP é um RST (pacote perdido)
    if (tcp.info.flags.reset) {
      this.retornoFront.qtdPacotesPerdidos++;
    }

    this._updateProtocolCount(
      ip.info.protocol,
      { dstPort: tcp.info.dstport, srcPort: tcp.info.srcport },
      ipv4Info
    );
  }

  private _processUdpPacket(
    ip: any,
    ipv4Info: { ipSrc: string; ipDst: string; totalLen: number }
  ): void {
    const udp = this.decoders.UDP(this.buffer, ip.offset);
    this.retornoFront.protocols.udp++;
    this.retornoFront.computers.find(
      (device) =>
        device.ipv4.includes(ipv4Info.ipSrc) ||
        device.ipv4.includes(ipv4Info.ipDst)
    )!.protocols.udp++;

    this._updateProtocolCount(
      ip.info.protocol,
      udp.info.dstport,
      udp.info.srcport
    );
  }

  private _updateProtocolCount(
    ipProtocol: number,
    ports: { dstPort: number; srcPort: number },
    ipv4Info: { ipSrc: string; ipDst: string }
  ): void {
    const isTCP = ipProtocol === this.decoders.PROTOCOL.IP.TCP;
    const isUDP = ipProtocol === this.decoders.PROTOCOL.IP.UDP;

    if (isTCP) {
      if (ports.dstPort === 80 || ports.srcPort === 80) {
        this.retornoFront.protocols.http++;
        this.retornoFront.computers.find(
          (device) =>
            device.ipv4.includes(ipv4Info.ipSrc) ||
            device.ipv4.includes(ipv4Info.ipDst)
        )!.protocols.http++;
      } else if (ports.dstPort === 443 || ports.srcPort === 443) {
        this.retornoFront.protocols.https++;
        this.retornoFront.computers.find(
          (device) =>
            device.ipv4.includes(ipv4Info.ipSrc) ||
            device.ipv4.includes(ipv4Info.ipDst)
        )!.protocols.https++;
      } else if (
        ports.dstPort === 20 ||
        ports.dstPort === 21 ||
        ports.srcPort === 20 ||
        ports.srcPort === 21
      ) {
        this.retornoFront.protocols.ftp++;
        this.retornoFront.computers.find(
          (device) =>
            device.ipv4.includes(ipv4Info.ipSrc) ||
            device.ipv4.includes(ipv4Info.ipDst)
        )!.protocols.ftp++;
      } else {
        this.retornoFront.protocols.other++;
        this.retornoFront.computers.find(
          (device) =>
            device.ipv4.includes(ipv4Info.ipSrc) ||
            device.ipv4.includes(ipv4Info.ipDst)
        )!.protocols.other++;
      }
    } else if (isUDP) {
      if (ports.dstPort === 443 || ports.srcPort === 443) {
        this.retornoFront.protocols.other++;
        this.retornoFront.computers.find(
          (device) =>
            device.ipv4.includes(ipv4Info.ipSrc) ||
            device.ipv4.includes(ipv4Info.ipDst)
        )!.protocols.other++;
      } else {
        // Se for UDP e a porta não for 443, também é "other"
        this.retornoFront.protocols.other++;
        this.retornoFront.computers.find(
          (device) =>
            device.ipv4.includes(ipv4Info.ipSrc) ||
            device.ipv4.includes(ipv4Info.ipDst)
        )!.protocols.other++;
      }
    } else {
      // Qualquer outro protocolo IP
      this.retornoFront.protocols.other++;
      this.retornoFront.computers.find(
        (device) =>
          device.ipv4.includes(ipv4Info.ipSrc) ||
          device.ipv4.includes(ipv4Info.ipDst)
      )!.protocols.other++;
    }
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

  resetProperties() {
    this.retornoFront.taxaTráfego = 0;
    this.retornoFront.protocols.ftp = 0;
    this.retornoFront.protocols.http = 0;
    this.retornoFront.protocols.https = 0;
    this.retornoFront.protocols.tcp = 0;
    this.retornoFront.protocols.udp = 0;
    this.retornoFront.qtdPacotesPerdidos = 0;
    this.retornoFront.qtdPacotesReenviados = 0;
    this.retornoFront.inputOutput.input = 0;
    this.retornoFront.inputOutput.output = 0;
    this.retornoFront.protocols.other = 0;

    this.retornoFront.computers.forEach((device) => {
      device.packetsIn = 0;
      device.packetsOut = 0;
      device.protocols = {
        http: 0,
        https: 0,
        ftp: 0,
        tcp: 0,
        udp: 0,
        other: 0,
      };
    });
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

    this.mappedDevices.forEach((device) => {
      totalInput += device.packetsIn;
      totalOutput += device.packetsOut;
    });

    this.retornoFront.inputOutput.input = totalInput;
    this.retornoFront.inputOutput.output = totalOutput;
  }
}

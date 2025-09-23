import {
  ResponseI,
  ComputerI,
  TcpConnectionInfoI,
  UdpRequestInfo,
} from "../models/response.interface";

export class PacketsService {
  buffer: Buffer<ArrayBuffer>;
  linkType: string;
  decoders: any;
  mappedDevices: ComputerI[];
  retornoFront: ResponseI;
  tcpConnections: Map<string, TcpConnectionInfoI>;
  qtdPacketsResend: number;
  private readonly udpRequests: Map<string, UdpRequestInfo> = new Map();
  private allRtts: number[] = [];

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

    let localAddress, externalAddress;
    // Verifica se o IP de origem pertence a um dos dispositivos mapeados
    const isOutgoing = this.mappedDevices.some(d => d.ipv4.includes(ipv4Info.ipSrc));

    if (isOutgoing) {
      localAddress = `${ipv4Info.ipSrc}:${tcp.info.srcport}`;
      externalAddress = `${ipv4Info.ipDst}:${tcp.info.dstport}`;
    } else {
      // Se o pacote não é de saída, ele deve ser de entrada
      localAddress = `${ipv4Info.ipDst}:${tcp.info.dstport}`;
      externalAddress = `${ipv4Info.ipSrc}:${tcp.info.srcport}`;
    }

    // Encontra o computador local associado
    const localComputer = this.mappedDevices.find(
      (device) =>
        device.ipv4.includes(ipv4Info.ipSrc) ||
        device.ipv4.includes(ipv4Info.ipDst)
    );

    if (!localComputer) {
      return;
    }

    // Encontra a sessão existente ou cria uma nova
    let sessionToUpdate = localComputer.sessions.find(
      s => s.localAddress === localAddress && s.externalAddress === externalAddress
    );

    if (!sessionToUpdate) {
      sessionToUpdate = {
        protocol: 'TCP',
        localAddress: localAddress,
        externalAddress: externalAddress,
        status: 'NEW',
      };
      localComputer.sessions.push(sessionToUpdate);
    }

    const isSyn = (tcp.info.flags & 2) !== 0;
    const isAck = (tcp.info.flags & 16) !== 0;
    const isFin = (tcp.info.flags & 1) !== 0;
    const isRst = (tcp.info.flags & 4) !== 0;

    if (isRst) {
      sessionToUpdate.status = 'CLOSED_RST';
    } else if (isFin) {
      const isLocalFin = (isOutgoing); // Se o pacote de FIN é de saída, o local iniciou o fechamento

      if (isLocalFin) {
        sessionToUpdate.status = 'TIME_WAIT';
      } else {
        sessionToUpdate.status = 'CLOSE_WAIT';
      }
    } else if (isSyn && !isAck) {
      sessionToUpdate.status = 'SYN_SENT';
    } else if (isSyn && isAck) {
      sessionToUpdate.status = 'ESTABLISHED';
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

    const outgoingKey = `${ipv4Info.ipSrc}:${udp.info.srcport}-${ipv4Info.ipDst}:${udp.info.dstport}`;
    const incomingKey = `${ipv4Info.ipDst}:${udp.info.dstport}-${ipv4Info.ipSrc}:${udp.info.srcport}`;

    const isOutgoing = this.mappedDevices.some(d => d.ipv4.includes(ipv4Info.ipSrc));
    const isIncoming = this.mappedDevices.some(d => d.ipv4.includes(ipv4Info.ipDst));

    if (isOutgoing) {
      this.udpRequests.set(outgoingKey, { timestamp: Date.now() });
    }

    if (isIncoming && this.udpRequests.has(incomingKey)) {
      const requestInfo = this.udpRequests.get(incomingKey)!;
      const rtt = Date.now() - requestInfo.timestamp;
      this.allRtts.push(rtt);
      this.udpRequests.delete(incomingKey);
    }

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
      device.sessions = [];
    });
  }

  public packetsResend(qtdPackets: number) {
    if (this.qtdPacketsResend === 0 || qtdPackets === 0) {
      this.retornoFront.qtdPacotesReenviados = 0;
      this.qtdPacketsResend = 0;
    } else {
      this.retornoFront.qtdPacotesReenviados =
        (this.qtdPacketsResend / qtdPackets) * 100;
      this.qtdPacketsResend = 0;
    }
  }

  public resetConnections(): void {
    this.tcpConnections.clear();
    this.udpRequests.clear();
    this.allRtts = [];
    
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

  public calculateAverageResponseTime(): void {
    if (this.allRtts.length > 0) {
      const sum = this.allRtts.reduce((acc, curr) => acc + curr, 0);
      this.retornoFront.tempoMedioResposta = sum / this.allRtts.length;
    } else {
      this.retornoFront.tempoMedioResposta = 0;
    }
  }
}

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

  private _decodePacket(): { eth: any; ip: any } | null {
    const eth = this.decoders.Ethernet(this.buffer);

    if (eth.info.type !== this.decoders.PROTOCOL.ETHERNET.IPV4) {
      return null;
    }

    const ip = this.decoders.IPV4(this.buffer, eth.offset);
    return { eth, ip };
  }

  private _getProtocolInfo(ip: any): { protocolName: string; info: string; ipv4Info: any } | null {
    let protocolName = "";
    let info = "";
    let ipv4Info = { ipSrc: ip.info.srcaddr, ipDst: ip.info.dstaddr, totalLen: ip.info.totallen };

    if (ip.info.protocol === this.decoders.PROTOCOL.IP.TCP) {
      const tcp = this.decoders.TCP(this.buffer, ip.offset);
      protocolName = "TCP";

      const flags = tcp.info.flags;
      const flagsArray = [];
      if ((flags & 2) !== 0) flagsArray.push('SYN');
      if ((flags & 16) !== 0) flagsArray.push('ACK');
      if ((flags & 1) !== 0) flagsArray.push('FIN');
      if ((flags & 4) !== 0) flagsArray.push('RST');

      const flagInfo = flagsArray.length > 0 ? `[${flagsArray.join(', ')}]` : '';
      const payloadLen = ipv4Info.totalLen - ip.hdrlen - tcp.hdrlen;

      info = `${tcp.info.srcport} > ${tcp.info.dstport} ${flagInfo} Seq=${tcp.info.seqno} Ack=${tcp.info.ackno} Len=${payloadLen}`;
      this._processTcpPacket(ip, ipv4Info);

      return { protocolName, info, ipv4Info };

    } else if (ip.info.protocol === this.decoders.PROTOCOL.IP.UDP) {
      const udp = this.decoders.UDP(this.buffer, ip.offset);
      protocolName = "UDP";
      info = `Source port: ${udp.info.srcport} Destination port: ${udp.info.dstport}`;
      this._processUdpPacket(ip, ipv4Info);

      return { protocolName, info, ipv4Info };
    }

    return null;
  }

  private _updateGlobalStats(eth: any, ipv4Info: any, protocolName: string, info: string): void {
    this._addLogToDevices(ipv4Info, protocolName, info);
    this.assignMacToDevice(eth.info.srcmac, ipv4Info);
    this.updateDevicePacketCount(ipv4Info);
    this.retornoFront.taxaTráfego += ipv4Info.totalLen;
  }
  public processPacket(): void {
    const decodedPacket = this._decodePacket();
    if (!decodedPacket) {
      return;
    }

    const { eth, ip } = decodedPacket;
    const protocolInfo = this._getProtocolInfo(ip);

    if (!protocolInfo) {
      return;
    }

    this._updateGlobalStats(eth, protocolInfo.ipv4Info, protocolInfo.protocolName, protocolInfo.info);

  }

  private _updateProtocolCounters(ipSrc: string, ipDst: string): void {
    this.retornoFront.protocols.tcp++;

    const device = this.retornoFront.computers.find(
      (d) => d.ipv4.includes(ipSrc) || d.ipv4.includes(ipDst)
    );
    if (device) {
      device.protocols.tcp++;
    }
  }

  private _determineSessionAddresses(ipSrc: string, ipDst: string, srcPort: number, dstPort: number): { localAddress: string; externalAddress: string } {
    const isOutgoing = this.mappedDevices.some((d) => d.ipv4.includes(ipSrc));

    if (isOutgoing) {
      return {
        localAddress: `${ipSrc}:${srcPort}`,
        externalAddress: `${ipDst}:${dstPort}`,
      };
    } else {
      return {
        localAddress: `${ipDst}:${dstPort}`,
        externalAddress: `${ipSrc}:${srcPort}`,
      };
    }
  }

  private _manageTcpSession(ipSrc: string, ipDst: string, localAddress: string, externalAddress: string, tcpFlags: number, isOutgoing: boolean): any {
    const localComputer = this.mappedDevices.find(
      (device) => device.ipv4.includes(ipSrc) || device.ipv4.includes(ipDst)
    );

    if (!localComputer) {
      return null;
    }

    let sessionToUpdate = localComputer.sessions.find(
      (s) => s.localAddress === localAddress && s.externalAddress === externalAddress
    );

    if (!sessionToUpdate) {
      sessionToUpdate = {
        protocol: 'TCP',
        localAddress,
        externalAddress,
        status: 'NEW',
      };
      localComputer.sessions.push(sessionToUpdate);
    }

    const isSyn = (tcpFlags & 2) !== 0;
    const isAck = (tcpFlags & 16) !== 0;
    const isFin = (tcpFlags & 1) !== 0;
    const isRst = (tcpFlags & 4) !== 0;

    if (isRst) {
      sessionToUpdate.status = 'CLOSED_RST';
    } else if (isFin) {
      const isLocalFin = isOutgoing;
      sessionToUpdate.status = isLocalFin ? 'TIME_WAIT' : 'CLOSE_WAIT';
    } else if (isSyn && !isAck) {
      sessionToUpdate.status = 'SYN_SENT';
    } else if (isSyn && isAck) {
      sessionToUpdate.status = 'ESTABLISHED';
    }

    return sessionToUpdate;
  }

  private _manageTcpConnection(ipSrc: string, ipDst: string, srcPort: number, dstPort: number, tcpFlags: number): any {
    const connectionKey = ipSrc < ipDst
      ? `${ipSrc}:${srcPort}-${ipDst}:${dstPort}`
      : `${ipDst}:${dstPort}-${ipSrc}:${srcPort}`;

    let connection = this.tcpConnections.get(connectionKey);

    if (!connection) {
      connection = {
        sourceIp: ipSrc,
        destinationIp: ipDst,
        sourcePort: srcPort,
        destinationPort: dstPort,
        sentPackets: new Map<number, number>(),
      };
      this.tcpConnections.set(connectionKey, connection);
    }

    const isSyn = (tcpFlags & 2) !== 0;
    const isAck = (tcpFlags & 16) !== 0;

    if (isSyn && !isAck) {
      connection.sentSynTime = Date.now();
    } else if (isSyn && isAck && connection.sentSynTime) {
      const rtt = Date.now() - connection.sentSynTime;
      this.allRtts.push(rtt);
      delete connection.sentSynTime;
    }

    return connection;
  }

  private _handlePacketStatus(connection: any, tcpSeqno: number, tcpPayloadLength: number, isRst: boolean): void {
    if (
      connection.sentPackets.has(tcpSeqno) &&
      connection.sentPackets.get(tcpSeqno) === tcpPayloadLength &&
      tcpPayloadLength !== 0
    ) {
      this.qtdPacketsResend++;
    } else {
      connection.sentPackets.set(tcpSeqno, tcpPayloadLength);
    }

    if (isRst) {
      this.retornoFront.qtdPacotesPerdidos++;
    }
  }

  private _processTcpPacket(
    ip: any,
    ipv4Info: { ipSrc: string; ipDst: string; totalLen: number }
  ): void {
    const tcp = this.decoders.TCP(this.buffer, ip.offset);
    const tcpFlags = tcp.info.flags;
    const isOutgoing = this.mappedDevices.some((d) => d.ipv4.includes(ipv4Info.ipSrc));

    this._updateProtocolCounters(ipv4Info.ipSrc, ipv4Info.ipDst);

    const { localAddress, externalAddress } = this._determineSessionAddresses(
      ipv4Info.ipSrc,
      ipv4Info.ipDst,
      tcp.info.srcport,
      tcp.info.dstport
    );

    const sessionToUpdate = this._manageTcpSession(
      ipv4Info.ipSrc,
      ipv4Info.ipDst,
      localAddress,
      externalAddress,
      tcpFlags,
      isOutgoing
    );

    if (!sessionToUpdate) {
      return;
    }

    const connection = this._manageTcpConnection(
      ipv4Info.ipSrc,
      ipv4Info.ipDst,
      tcp.info.srcport,
      tcp.info.dstport,
      tcpFlags
    );

    const tcpPayloadLength = ipv4Info.totalLen - ip.hdrlen - tcp.hdrlen;
    const isRst = (tcpFlags & 4) !== 0;

    this._handlePacketStatus(connection, tcp.info.seqno, tcpPayloadLength, isRst);

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

    const device = this.retornoFront.computers.find(
      (dev) => dev.ipv4.includes(ipv4Info.ipSrc) || dev.ipv4.includes(ipv4Info.ipDst)
    );

    if (!device) {
      return; // Se não encontrar o dispositivo, saia.
    }

    if (isTCP) {
      if (ports.dstPort === 80 || ports.srcPort === 80) {
        this.retornoFront.protocols.http++;
        device.protocols.http++;
      } else if (ports.dstPort === 443 || ports.srcPort === 443) {
        this.retornoFront.protocols.https++;
        device.protocols.https++;
      } else if (
        ports.dstPort === 20 ||
        ports.dstPort === 21 ||
        ports.srcPort === 20 ||
        ports.srcPort === 21
      ) {
        this.retornoFront.protocols.ftp++;
        device.protocols.ftp++;
      } else {
        this.retornoFront.protocols.other++;
        device.protocols.other++;
      }
    } else {
      // Para outros protocolos de IP que não são TCP ou UDP
      this.retornoFront.protocols.other++;
      device.protocols.other++;
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
      device.logs = [];
    });
  }

  public packetsResend(qtdPackets: number) {
    if (this.qtdPacketsResend === 0 || qtdPackets === 0) {
      this.retornoFront.qtdPacotesReenviados = 0;
      this.qtdPacketsResend = 0;
    } else {
      this.retornoFront.qtdPacotesReenviados =
        (this.qtdPacketsResend / qtdPackets) * 100;
      console.log(this.retornoFront.qtdPacotesReenviados)
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

  private _addLogToDevices(
    ipv4Info: { ipSrc: string; ipDst: string; totalLen: number },
    protocolName: string,
    info: string
  ): void {

    // Verificação para desconsiderar logs vazios
    if (!protocolName || !ipv4Info.ipSrc) {
      return;
    }

    const logEntry = {
      source: ipv4Info.ipSrc,
      destination: ipv4Info.ipDst,
      protocol: protocolName,
      length: ipv4Info.totalLen,
      info: info,
    };

    // Encontra o dispositivo de origem e adiciona o log
    const sourceDevice = this.mappedDevices.find((d) => d.ipv4.includes(ipv4Info.ipSrc));
    if (sourceDevice) {
      sourceDevice.logs.push(logEntry);
    }

    // Encontra o dispositivo de destino e adiciona o log, se for diferente do de origem
    const destDevice = this.mappedDevices.find((d) => d.ipv4.includes(ipv4Info.ipDst));
    if (destDevice && (!sourceDevice || sourceDevice.ipv4[0] !== destDevice.ipv4[0])) {
      destDevice.logs.push(logEntry);
    }

    console.log(logEntry)
  }
}

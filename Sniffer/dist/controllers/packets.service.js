"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PacketsService = void 0;
class PacketsService {
    constructor(buffer, linkType, decoders, mappedDevices, retornoFront) {
        this.buffer = buffer;
        this.linkType = linkType;
        this.decoders = decoders;
        this.mappedDevices = mappedDevices;
        this.retornoFront = retornoFront;
    }
    processPacket() {
        let macInfo = "";
        let ipv4Info = { ipSrc: "", ipDst: "" };
        const eth = this.decoders.Ethernet(this.buffer);
        macInfo = eth.info.srcmac;
        if (eth.info.type === this.decoders.PROTOCOL.ETHERNET.IPV4) {
            const ip = this.decoders.IPV4(this.buffer, eth.offset);
            ipv4Info.ipSrc = ip.info.srcaddr;
            ipv4Info.ipDst = ip.info.dstaddr;
            if (ip.info.protocol === this.decoders.PROTOCOL.IP.TCP) {
                const tcp = this.decoders.TCP(this.buffer, ip.offset);
                this.retornoFront.protocols.tcp++;
                // Verifica se o pacote TCP é um RST (pacote perdido)
                if (tcp.info.flags.reset) {
                    this.retornoFront.qtdPacotesPerdidos++;
                }
                if (tcp.info.flags.syn && tcp.info.flags.ack) {
                    // Pacote SYN-ACK, parte do handshake
                }
                else if (tcp.info.flags.syn) {
                    // Pacote SYN, início de uma nova conexão
                }
                else if (tcp.info.flags.ack) {
                    // Pacote ACK, parte do handshake ou confirmação de dados
                }
                else if (tcp.info.flags.fin) {
                    // Pacote FIN, término de conexão
                }
                else if (tcp.info.flags.psh) {
                    // Pacote PSH, dados sendo enviados
                }
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
            }
            else if (ip.info.protocol === this.decoders.PROTOCOL.IP.UDP) {
                const udp = this.decoders.UDP(this.buffer, ip.offset);
                this.retornoFront.protocols.udp++;
                if (udp.info.length > 512) {
                    this.retornoFront.qtdPacotesPerdidos++;
                }
                if (udp.info.length > 512) {
                    this.retornoFront.qtdPacotesReenviados++;
                }
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
    assignMacToDevice(macInfo, ipv4Info) {
        this.mappedDevices.forEach((d) => {
            if (!d.mac && d.ipv4.includes(ipv4Info.ipSrc)) {
                d.mac = macInfo;
            }
        }); // atribui mac a endereço IPv4 correspondente
    }
    updateDevicePacketCount(ipv4Info) {
        // Procura o dispositivo mapeado que corresponde ao IP de origem
        const sourceDevice = this.mappedDevices.find((dev) => dev.ipv4.includes(ipv4Info.ipSrc));
        if (sourceDevice) {
            sourceDevice.packetsOut++;
        }
        // Procura o dispositivo mapeado que corresponde ao IP de destino
        const destDevice = this.mappedDevices.find((dev) => dev.ipv4.includes(ipv4Info.ipDst));
        if (destDevice) {
            destDevice.packetsIn++;
        }
    }
}
exports.PacketsService = PacketsService;

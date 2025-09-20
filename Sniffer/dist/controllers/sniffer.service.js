"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnifferService = void 0;
const cap_1 = __importDefault(require("cap")); // Cap: Captura de Pacotes // decoders: Decodifica pacotes brutos para serem interpretados
const websocket_1 = require("../routes/websocket");
const packets_service_1 = require("./packets.service");
class SnifferService {
    constructor() {
        this.filter = "";
        this.bufSize = 0;
    }
    SnifferService() {
        this.cap = new cap_1.default();
        this.filter = "tcp port 80 or tcp port 443 or tcp port 20 or tcp port 21"; // TCP nas portas HTTP, HTTPS e FTP
        // this.filter = 'tcp port 3000 or tcp port 20 or tcp port 3001'; // usar esse depois
        this.bufSize = 10485760; // Tamanho Máximo de um pedaço pacote normalmente é 9MB mas serve como garantia
        this.buffer = Buffer.alloc(65535); // Tamanho Máximo de um pacote IPV4
        this.retornoFront = {
            qtdComputadores: 0,
            qtdPacotesPerdidos: 0,
            qtdPacotesReenviados: 0,
            taxaTráfego: 0,
            tempoMedioResposta: 0,
            computers: [],
            protocols: {
                http: 0,
                https: 0,
                ftp: 0,
                tcp: 0,
                udp: 0,
                other: 0,
            },
            inputOutput: {
                input: 0,
                output: 0,
            },
        };
    }
    capturePackets() {
        let qtdPackets = 0;
        var realDevices = cap_1.default.deviceList() // lista de interfaces do sistema
            .filter((d) => d.addresses.some((a) => a.addr && (a.addr.includes(".") || a.addr.includes(":"))) // Verifica no array se atende aos requistos
        )
            .map((d) => {
            const ipv4Addresses = d.addresses
                .filter((a) => a.addr.includes("."))
                .map((a) => a.addr);
            const ipv6Addresses = d.addresses
                .filter((a) => a === null || a === void 0 ? void 0 : a.addr.includes(":"))
                .map((a) => a.addr);
            return {
                name: d.name,
                ipv4: ipv4Addresses,
                ipv6: ipv6Addresses,
                mac: null,
                packetsIn: 0,
                packetsOut: 0,
            };
        });
        //const device = '\\Device\\NPF_{3156B2CC-C04B-481E-97CB-E6DE71485329}';    // Altere para a placa de rede do Sniffer (estamos usando somente do PC para testes)
        const device = cap_1.default.findDevice("172.29.62.226");
        if (!device) {
            console.error("Nenhuma interface disponível. Verifique permissão / drivers.");
            process.exit(1);
        }
        const linkType = this.cap.open(device, this.filter, this.bufSize, this.buffer); // Começa a ver pacotes
        this.cap.setMinBytes(0); // Captura acontece até em pacotes de tamanho 0
        const packetsService = new packets_service_1.PacketsService(this.buffer, linkType, cap_1.default.decoders, realDevices, this.retornoFront);
        this.cap.on("packet", () => {
            qtdPackets++;
            this.retornoFront.computers = realDevices;
            this.retornoFront.qtdComputadores = realDevices.length;
            try {
                packetsService.processPacket();
            }
            catch (err) {
                console.error("Erro ao decodificar pacote:", err.message);
            }
        });
        setInterval(() => {
            websocket_1.io.emit("packetData", this.retornoFront);
        }, 5000);
    }
}
exports.SnifferService = SnifferService;

// @ts-ignore
import Cap from "cap"; // Cap: Captura de Pacotes // decoders: Decodifica pacotes brutos para serem interpretados
import { io } from "../routes/websocket";
import { ComputerI, ResponseI } from "../models/response.interface";
import { PacketsService } from "./packets.service";

export class SnifferService {
  cap: any;
  filter: string = "";
  bufSize: number = 0;
  buffer!: Buffer<ArrayBuffer>; // Tamanho Máximo de um pacote IPV4
  qtdPackets: number = 0;
  retornoFront!: ResponseI;
  packetsService!: PacketsService;

  constructor() {
    this.cap = new Cap.Cap();
    this.filter =
      "tcp port 80 or tcp port 443 or tcp port 20 or tcp port 21 or udp port 20 or udp port 21 or udp port 443 or udp port 80"; // TCP nas portas HTTP, HTTPS e FTP
    // this.filter = 'tcp port 3000 or tcp port 20 or tcp port 3001'; // usar esse depois
    this.bufSize = 10485760; // Tamanho Máximo de um pedaço pacote normalmente é 9MB mas serve como garantia
    this.buffer = Buffer.alloc(65535); // Tamanho Máximo de um pacote IPV4
    this.qtdPackets = 0;
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
    let realDevices: ComputerI[] = Cap.deviceList() // lista de interfaces do sistema
      .filter(
        (d: { addresses: any[] }) =>
          d.addresses.some(
            (a: any) =>
              a.addr &&
              (a.addr.includes(".") || a.addr.includes(":")) &&
              a.addr !== "127.0.0.1" &&
              a.addr !== "::1"
          ) // Verifica no array se atende aos requistos
      )
      .map((d: any) => {
        const ipv4Addresses = d.addresses
          .filter((a: any) => a.addr.includes("."))
          .map((a: any) => a.addr);
        console.log(ipv4Addresses);
        const ipv6Addresses = d.addresses
          .filter((a: any) => a?.addr.includes(":"))
          .map((a: any) => a.addr);
        return {
          name: d.name,
          ipv4: ipv4Addresses,
          ipv6: ipv6Addresses,
          mac: null,
          packetsIn: 0,
          packetsOut: 0,
          protocols: {
            http: 0,
            https: 0,
            ftp: 0,
            tcp: 0,
            udp: 0,
            other: 0,
          },
        };
      });

    // realDevices.push({
    //   index: -1,
    //   name: '192.168.15.28',
    //   ipv4: ['192.168.15.28'],
    //   ipv6: [],
    //   mac: null,
    //   packetsIn: 0,
    //   packetsOut: 0,
    //   protocols: {
    //     http: 0,
    //     https: 0,
    //     ftp: 0,
    //     tcp: 0,
    //     udp: 0,
    //     other: 0,
    //   },
    // });

    //const device = '\\Device\\NPF_{3156B2CC-C04B-481E-97CB-E6DE71485329}';    // Altere para a placa de rede do Sniffer (estamos usando somente do PC para testes)
    const device = Cap.findDevice("192.168.15.31");
    if (!device) {
      console.error(
        "Nenhuma interface disponível. Verifique permissão / drivers."
      );
      process.exit(1);
    }

    const linkType = this.cap.open(
      device,
      this.filter,
      this.bufSize,
      this.buffer
    ); // Começa a ver pacotes

    // this.cap.setMinBytes(0); // Captura acontece até em pacotes de tamanho 0

    const packetsService = new PacketsService(
      this.buffer,
      linkType,
      Cap.decoders,
      realDevices,
      this.retornoFront,
      this.qtdPackets
    );

    this.packetsService = packetsService;

    this.cap.on("packet", () => {
      this.qtdPackets++;
      this.retornoFront.computers = realDevices;
      this.retornoFront.qtdComputadores = realDevices.length;
      try {
        packetsService.processPacket();
      } catch (err: any) {
        console.error("Erro ao decodificar pacote:", err.message);
      }
    });

    setInterval(() => {
      
      this.retornoFront.taxaTráfego = this.retornoFront.taxaTráfego / 5;
      this.packetsService.updateInputOutput();
      this.packetsService.packetsResend(this.qtdPackets);
      this.packetsService.calculateAverageResponseTime();
      io.emit("packetData", this.retornoFront);

      this.packetsService.resetProperties();
      this.packetsService.resetConnections();
      this.qtdPackets = 0;
    }, 5000);
  }
}

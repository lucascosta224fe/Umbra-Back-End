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

  constructor() {
    this.cap = new Cap.Cap();
    this.filter = "tcp port 80 or tcp port 443 or tcp port 20 or tcp port 21"; // TCP nas portas HTTP, HTTPS e FTP
    // this.filter = 'tcp port 3000 or tcp port 20 or tcp port 3001'; // usar esse depois
    this.bufSize = 10485760; // Tamanho Máximo de um pedaço pacote normalmente é 9MB mas serve como garantia
    this.buffer = Buffer.alloc(65535); // Tamanho Máximo de um pacote IPV4
    this.qtdPackets = 0
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
            (a: any) => a.addr && (a.addr.includes(".") || a.addr.includes(":"))
          ) // Verifica no array se atende aos requistos
      )
      .map((d: any) => {
        const ipv4Addresses = d.addresses
          .filter((a: any) => a.addr.includes("."))
          .map((a: any) => a.addr);
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
        };
      });

    //const device = '\\Device\\NPF_{3156B2CC-C04B-481E-97CB-E6DE71485329}';    // Altere para a placa de rede do Sniffer (estamos usando somente do PC para testes)
    const device = Cap.findDevice("192.168.15.5");
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
      this.retornoFront
    );

    this.cap.on("packet",  () => {
      const {ipv4Info}: any = packetsService.processPacket
      this.retornoFront.taxaTráfego = this.retornoFront.taxaTráfego + ipv4Info.totallen;
      this.retornoFront.computers = realDevices;
      this.retornoFront.qtdComputadores = realDevices.length;
      
      try {
        packetsService.processPacket();
      } catch (err: any) {
        console.error("Erro ao decodificar pacote:", err.message);
      }
    });

    
    setInterval(() => {
      this.retornoFront.taxaTráfego = (this.retornoFront.taxaTráfego / 5)
      
      io.emit("packetData", this.retornoFront);

      PacketsService.resetProperties(this.retornoFront)
      this.qtdPackets = 0

    }, 5000);
  }
}

// @ts-ignore
import Cap from "cap"; // Cap: Captura de Pacotes // decoders: Decodifica pacotes brutos para serem interpretados
import { io } from "../routes/websocket";
import { ComputerI, ResponseI } from "../models/response.interface";
import { PacketsService } from "./packets.service";
import * as raw from "raw-socket";
import * as os from "os";


export class SnifferService {
  cap: any;
  filter: string = "";
  bufSize: number = 0;
  buffer!: Buffer<ArrayBuffer>; // Tamanho Máximo de um pacote IPV4
  qtdPackets: number = 0;
  retornoFront!: ResponseI;
  packetsService!: PacketsService;
  private readonly chartHistory: Map<string, { time: number; packages: number; tcpError: number }[]> = new Map();
  private timeElapsed: number = 0;

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

    const ipToUse = "192.168.15.5";

    const interfaces = os.networkInterfaces();
    let localIpV4 = "";
    let localMac = "";

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        // Encontra o endereço IPv4 que você está procurando e verifica se é a interface correta
        if (!iface.internal && iface.family === 'IPv4' && iface.address === ipToUse) {
          localIpV4 = iface.address;
          localMac = iface.mac;
          break;
        }
      }
      if (localIpV4) {
        break;
      }
    }

    if (!localIpV4 || !localMac) {
      console.error("Não foi possível obter o IP ou MAC local.");
      process.exit(1);
    }

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
        const macAddr = d.addresses.find((a: any) => a.mac)?.mac || null;
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
          lineChartData: [],
          sessions: []
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
    const device = Cap.findDevice("192.168.15.5");
    if (!device) {
      console.error(
        "Nenhuma interface disponível. Verifique permissão / drivers."
      );
      process.exit(1);
    }

    // this.cap.setMinBytes(0); // Captura acontece até em pacotes de tamanho 0

    const foundIps = new Set<string>();
    realDevices.forEach(d => d.ipv4.forEach(ip => foundIps.add(ip)));

    const linkType = this.cap.open(
      device, // O nome da interface retornado por Cap.findDevice()
      this.filter,
      this.bufSize,
      this.buffer
    );

    const ipToNumber = (ip: string) => ip.split('.').reduce((acc: number, part: string) => (acc << 8) + parseInt(part, 10), 0);
    const localIpNum = ipToNumber(localIpV4);
    const networkMask = '255.255.255.0';
    const maskNum = ipToNumber(networkMask);
    const networkAddress = localIpNum & maskNum;

    const sendArpRequest = (targetIp: string) => {
      const socket = raw.createSocket({ protocol: raw.Protocol.ARP });
      const arpPacket = Buffer.from([
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        ...localMac.split(':').map((hex: string) => parseInt(hex, 16)),
        0x08, 0x06,
        0x00, 0x01,
        0x08, 0x00,
        0x06,
        0x04,
        0x00, 0x01,
        ...localMac.split(':').map((hex: string) => parseInt(hex, 16)),
        ...localIpV4.split('.').map((num: string) => parseInt(num, 10)),
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ...targetIp.split('.').map((num: string) => parseInt(num, 10))
      ]);
      socket.send(arpPacket, 0, arpPacket.length, localIpV4, (err: any, _bytes: any) => {
        if (err) console.error("Erro ao enviar ARP:", err);
        socket.close();
      });
    };

    console.log("Iniciando escaneamento ARP...");
    for (let i = 1; i <= 254; i++) {
      const targetIp = `${(networkAddress >> 24) & 0xFF}.${(networkAddress >> 16) & 0xFF}.${(networkAddress >> 8) & 0xFF}.${i}`;
      if (!foundIps.has(targetIp)) {
        sendArpRequest(targetIp);
      }
    }

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

      this.timeElapsed += 5;

      this.retornoFront.computers.forEach(computer => {

        // Pega a quantidade de pacotes exata de cada computador.
        const packages = computer.packetsIn + computer.packetsOut;

        const tcpError = (this.retornoFront.qtdPacotesReenviados * this.qtdPackets / 100) + this.retornoFront.qtdPacotesPerdidos;

        let history = this.chartHistory.get(computer.ipv4[0]);
        if (!history) {
          history = [];
          this.chartHistory.set(computer.ipv4[0], history);
        }

        history.push({
          time: this.timeElapsed,
          packages: packages,
          tcpError: tcpError
        });

        // Mantém apenas os últimos 6 pontos (30 segundos).
        if (history.length > 12) {
          history.shift();
        }

        computer.lineChartData = history.map((point, index) => ({
          time: (index + 1) * 5,
          packages: point.packages,
          tcpError: point.tcpError
        }));
      });

      io.emit("packetData", this.retornoFront);
      // Verificação de segurança antes de tentar acessar o índice

      this.packetsService.resetProperties();
      this.packetsService.resetConnections();
      this.qtdPackets = 0;
    }, 5000);
  }
}

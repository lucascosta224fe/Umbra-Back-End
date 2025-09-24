// @ts-ignore
import Cap from "cap";
import { io } from "../routes/websocket";
import { ComputerI, ResponseI } from "../models/response.interface";
import { PacketsService } from "./packets.service";
import { exec } from 'child_process'; // Importa o módulo para rodar comandos
import * as os from "os";

export class SnifferService {
  cap: any;
  filter: string = "";
  bufSize: number = 0;
  buffer!: Buffer<ArrayBuffer>;
  qtdPackets: number = 0;
  retornoFront!: ResponseI;
  packetsService!: PacketsService;
  private readonly chartHistory: Map<string, { time: number; packages: number; tcpError: number }[]> = new Map();
  private timeElapsed: number = 0;

  constructor() {
    this.cap = new Cap.Cap();
    this.filter =
      "tcp port 80 or tcp port 443 or tcp port 20 or tcp port 21 or udp port 20 or udp port 21 or udp port 443 or udp port 80 or arp";
    this.bufSize = 10485760;
    this.buffer = Buffer.alloc(65535);
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
    const interfaces = os.networkInterfaces();
    let localIpV4 = "";
    let deviceName = "";
    
    // Obtenha o IP local e o nome da interface
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if (!iface.internal && iface.family === 'IPv4') {
          localIpV4 = iface.address;
          deviceName = name;
          break;
        }
      }
      if (localIpV4) break;
    }

    if (!localIpV4 || !deviceName) {
      console.error("Não foi possível obter o IP ou nome da interface local.");
      process.exit(1);
    }
    
    let realDevices: ComputerI[] = [];
    const foundIps = new Set<string>();

    const runArpScan = () => {
      return new Promise<void>((resolve, reject) => {
        // -l: lista todos os hosts na rede local
        // -I: especifica a interface de rede
        exec(`arp-scan -l -I ${deviceName}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Erro ao executar arp-scan: ${error.message}`);
            return reject(error);
          }
          if (stderr) {
            console.error(`Stderr: ${stderr}`);
          }
          
          const lines = stdout.split('\n');
          lines.forEach(line => {
            const parts = line.split('\t');
            if (parts.length >= 2) {
              const ip = parts[0];
              const mac = parts[1];
              if (ip && mac && !foundIps.has(ip)) {
                realDevices.push({
                  index: realDevices.length,
                  name: ip,
                  ipv4: [ip],
                  ipv6: [],
                  mac: mac,
                  packetsIn: 0,
                  packetsOut: 0,
                  protocols: { http: 0, https: 0, ftp: 0, tcp: 0, udp: 0, other: 0 },
                  lineChartData: [],
                  sessions: []
                });
                foundIps.add(ip);
              }
            }
          });
          resolve();
        });
      });
    };

    runArpScan().then(() => {
        const device = Cap.findDevice(localIpV4);
        if (!device) {
          console.error("Nenhuma interface disponível. Verifique permissão / drivers.");
          process.exit(1);
        }

        const linkType = this.cap.open(
          device,
          this.filter,
          this.bufSize,
          this.buffer
        );
        
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

          this.packetsService.resetProperties();
          this.packetsService.resetConnections();
          this.qtdPackets = 0;
        }, 5000);
    });
  }
}
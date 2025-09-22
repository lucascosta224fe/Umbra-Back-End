export interface ComputerI {
  index: number;
  name: string;
  ipv4: string;
  ipv6: string;
  mac: string;
  protocols: ProtocolsI;
  packetsIn: number;
  packetsOut: number;
}
export interface ResponseI {
  qtdComputadores: number; // mappedDevices.at(-1).index
  qtdPacotesPerdidos: number; // RST TCP
  qtdPacotesReenviados: number; // meio complexo deixa p dps
  taxaTráfego: number;
  tempoMedioResposta: number; // msm lógica do pacotes reenviados
  computers: ComputerI[];
  protocols: ProtocolsI;
  inputOutput: InputOutput;
}

export interface ProtocolsI {
  http: number;
  https: number;
  ftp: number;
  tcp: number;
  udp: number;
  other: number;
}

export interface InputOutput {
  input: number;
  output: number;
}

export interface TcpConnectionInfoI {
  sourceIp: string;
  destinationIp: string;
  sourcePort: number;
  destinationPort: number;
  sentPackets: Map<number, number>;
}

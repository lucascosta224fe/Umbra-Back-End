const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Cap = require('cap').Cap;                      // Captura de Pacotes
const decoders = require('cap').decoders;            // Decodifica pacotes brutos para serem interpretados
const PROTOCOL = decoders.PROTOCOL;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const fivesecBuffer = [];
var qtdPackets = 0

setInterval(() => {
  const packetsToSend = [...fivesecBuffer]
  fivesecBuffer.length = 0

  if (packetsToSend.length > 0) {
    console.log(`Enviando ${packetsToSend.length} pacotes para o frontend.`);

  }
}, 5000)

app.get('/', (req, res) => res.send('Sniffer rodando. Conecte o frontend ao socket.'));

const capture = new Cap();
const devices = Cap.deviceList(); // lista de interfaces do sistema

const realDevices = devices.filter(d =>
  d.addresses.some(a => a.addr && (a.addr.includes('.') || a.addr.includes(':')))  // Verifica no array se atende aos requistos
);

const mappedDevices = realDevices.map((d, i) => {
  const ipv4Addresses = d.addresses
    .filter(a => a.addr && a.addr.includes('.'))
    .map(a => a.addr);
  const ipv6Addresses = d.addresses
    .filter(a => a.addr && a.addr.includes(':'))
    .map(a => a.addr);
  return {
    index: i,
    name: d.name,
    ipv4: ipv4Addresses,
    ipv6: ipv6Addresses,
    mac: null
  };
});

console.log('Interfaces de Rede Mapeadas:');
console.log(mappedDevices);

const device = '\\Device\\NPF_{3156B2CC-C04B-481E-97CB-E6DE71485329}';    // Altere para a placa de rede do Sniffer (estamos usando somente do PC para testes)
if (!device) {
  console.error('Nenhuma interface disponível. Verifique permissão / drivers.');
  process.exit(1);
}

// TCP nas portas HTTP, HTTPS e FTP
const filter = 'tcp port 80 or tcp port 443 or tcp port 20 or tcp port 21'; // Retirar 443 depois de testes

const bufSize = 10 * 1024 * 1024; // Tamanho Máximo de um pedaço pacote normalmente é 9MB mas serve como garantia
const buffer = Buffer.alloc(65535); // Tamanho Máximo de um pacote IPV4

const linkType = capture.open(device, filter, bufSize, buffer); // Começa a ver pacotes 
capture.setMinBytes && capture.setMinBytes(0); // Captura acontece até em pacotes de tamanho 0 

capture.on('packet', function (nbytes, trunc) {

  qtdPackets++

  var macinfo
  var ipv4info

  try {
    if (linkType === 'ETHERNET') {
      const eth = decoders.Ethernet(buffer);

      const macSrc = eth.info.srcmac;
      const macDst = eth.info.dstmac;

      macinfo = {
        macSrc: macSrc,
        macDst: macDst
      }

      if (eth.info.type === PROTOCOL.ETHERNET.IPV4) {
        const ip = decoders.IPV4(buffer, eth.offset);
        ipv4info = {
          ipv4src: ip.info.srcaddr,  // endereço de origem do pacote
          ipv4dst: ip.info.dstaddr,  // endereço de destino do pacote
          protocol: ip.info.protocol, // protocolo da camada de transporte (ex: TCP = 6, UDP = 17, ICMP = 1)
        };

        if (ip.info.protocol === PROTOCOL.IP.TCP) {
          const tcp = decoders.TCP(buffer, ip.offset);
          ipv4info.srcport = tcp.info.srcport;
          ipv4info.dstport = tcp.info.dstport;

          // Define tipo de pacote
          if (tcp.info.srcport === 80 || tcp.info.dstport === 80) ipv4info.type = 'HTTP';
          else if (tcp.info.srcport === 443 || tcp.info.dstport === 443) ipv4info.type = 'HTTPS';
          else if ([20, 21].includes(tcp.info.srcport) || [20, 21].includes(tcp.info.dstport)) ipv4info.type = 'FTP';
          else info.type = 'OTHER';
        } else if (ip.info.protocol === PROTOCOL.IP.UDP) {
          // UDP decode se desejar
        }

        io.emit('packet', ipv4info);
      }

    }

    for (let k = 0; k < mappedDevices.at(-1).index; k++) {
      if (ipv4info.ipv4src && mappedDevices[k].ipv4.includes(ipv4info.ipv4src)) {
        mappedDevices[k].mac = macinfo.macSrc;
        console.log(mappedDevices[k].mac)
      }
    }  // atribui mac a endereço IPv4 correspondente

  } catch (err) {
    console.error('Erro ao decodificar pacote:', err.message);
  }
});

io.on('connection', (socket) => {
  console.log('Frontend conectado');
});

server.listen(3000, () => console.log('Sniffer server ouvindo na porta 3000'));


setInterval(() => {
  console.log(`Pacotes nos últimos 5 segundos: ${qtdPackets}`);
  qtdPackets = 0;
}, 5000);

//API


// const dashboardResponse = {
//   topCards: [
//     {
//       name: "Computadores",
//       value: "string" //mappedDevices.at(-1).index
//     },

//     {
//       name: "Pacotes Perdidos",
//       value: 0
//     },

//     {
//       name: "Pacotes Reenviados",
//       value: 0
//     },

//     {
//       name: "Taxa de Tráfego",
//       value: 0
//     },

//     {
//       name: "Tempo Médio de Resposta",
//       value: 0
//     }
//   ],
//   computers: [ // realDevices
//     {
//       name: string,
//       ipv4: string,
//       ipv6: string,
//       macAddress: string,
//       numRequests: 0
//     },
//     {

//     }
//   ],
//   protocols: [
//     {
//       name: string,
//       value: 0
//     }
//   ],
//   inputOutput: {
//     input: 0,
//     output: 0
//   }
// }
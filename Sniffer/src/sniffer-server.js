const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Cap = require('cap').Cap;
const decoders = require('cap').decoders;
const PROTOCOL = decoders.PROTOCOL;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",  
    methods: ["GET", "POST"]
  }
});


app.get('/', (req, res) => res.send('Sniffer rodando. Conecte o frontend ao socket.'));

const c = new Cap();
const devices = Cap.deviceList(); // lista de interfaces do sistema
console.log('Interfaces disponíveis:');
devices.forEach((d,i) => console.log(i, d.name, d.addresses.map(a => a.addr).join(', ')));

const device = '\\Device\\NPF_{31F349E8-451D-45D8-99E6-BF043F5B7BA5}';
if (!device) {
  console.error('Nenhuma interface disponível. Verifique permissão / drivers.');
  process.exit(1);
}

// TCP nas portas HTTP, HTTPS e FTP
const filter = 'tcp port 80 or tcp port 443 or tcp port 20 or tcp port 21';

const bufSize = 10 * 1024 * 1024;
const buffer = Buffer.alloc(65535);

const linkType = c.open(device, filter, bufSize, buffer);
c.setMinBytes && c.setMinBytes(0);

c.on('packet', (nbytes) => {
  try {
    if (linkType === 'ETHERNET') {
      const eth = decoders.Ethernet(buffer);
      if (eth.info.type === PROTOCOL.ETHERNET.IPV4) {
        const ip = decoders.IPV4(buffer, eth.offset);
        let info = {
          src: ip.info.srcaddr,  // endereço de origem do pacote
          dst: ip.info.dstaddr,  // endereço de destino do pacote
          protocol: ip.info.protocol, // protocolo da camada de transporte (ex: TCP = 6, UDP = 17, ICMP = 1)
        };
        if (ip.info.protocol === PROTOCOL.IP.TCP) {
          const tcp = decoders.TCP(buffer, ip.offset);
          info.srcport = tcp.info.srcport;
          info.dstport = tcp.info.dstport;

          // Define tipo de pacote
          if (tcp.info.srcport === 80 || tcp.info.dstport === 80) info.type = 'HTTP';
          else if (tcp.info.srcport === 443 || tcp.info.dstport === 443) info.type = 'HTTPS';
          else if ([20, 21].includes(tcp.info.srcport) || [20, 21].includes(tcp.info.dstport)) info.type = 'FTP';
          else info.type = 'OTHER';
        } else if (ip.info.protocol === PROTOCOL.IP.UDP) {
          // UDP decode se desejar
        }

        io.emit('packet', info);
      }
    }
  } catch (err) {
    console.error('Erro ao decodificar pacote:', err.message);
  }
});

io.on('connection', (socket) => {
  console.log('Frontend conectado');
});

server.listen(3000, () => console.log('Sniffer server ouvindo na porta 3000'));

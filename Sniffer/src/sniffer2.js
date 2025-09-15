import * as pcap from 'pcap';

const pcapSession = pcap.createSession('', '');
const interfaces = pcap.findalldevs();

if(interfaces.length === 0) {
  console.error('Nenhuma interface de rede disponível. Verifique instalação Npcap.');
  process.exit(-1);
}

console.log('Interfaces disponíveis:');
interfaces.forEach((iface, i) => {
  console.log(i, iface.name, iface.addresses.map(a => a.addr).join(', '), iface.description || 'Sem descrição');
});
const { PacketsService } = require('../packets.service');

describe('PacketsService', () => {
  let buffer;
  let retornoFront;
  let devices;
  let decoders;

  beforeEach(() => {
    buffer = Buffer.alloc(100);

    retornoFront = {
      taxaTráfego: 0,
      qtdPacotesPerdidos: 0,
      qtdPacotesReenviados: 0,
      protocols: { http: 0, https: 0, ftp: 0, tcp: 0, udp: 0, other: 0 },
      inputOutput: { input: 0, output: 0 },
      computers: [
        { ipv4: ['1.1.1.1'], ipv6: [], mac: null, packetsIn: 0, packetsOut: 0, protocols: { http:0, https:0, ftp:0, tcp:0, udp:0, other:0 } },
        { ipv4: ['2.2.2.2'], ipv6: [], mac: null, packetsIn: 0, packetsOut: 0, protocols: { http:0, https:0, ftp:0, tcp:0, udp:0, other:0 } },
      ]
    };

    // decoders simulados
    decoders = {
      PROTOCOL: { ETHERNET: { IPV4: 0x0800 }, IP: { TCP: 6, UDP: 17 } },
      Ethernet: jest.fn().mockReturnValue({ info: { type: 0x0800, srcmac: 'AA:BB', }, offset: 14 }),
      IPV4: jest.fn().mockReturnValue({ info: { srcaddr: '1.1.1.1', dstaddr: '2.2.2.2', totallen: 100, protocol: 6 }, offset: 34, hdrlen: 20 }),
      TCP: jest.fn().mockReturnValue({ info: { srcport: 1234, dstport: 80, seqno: 1, flags: { reset: false } }, hdrlen: 20 }),
      UDP: jest.fn().mockReturnValue({ info: { srcport: 1234, dstport: 53 }, hdrlen: 8 })
    };
  });

  it('construtor inicializa propriedades', () => {
    const service = new PacketsService(buffer, 'link', decoders, devices, retornoFront, 0);
    expect(service.buffer).toBe(buffer);
    expect(service.decoders).toBe(decoders);
    expect(service.mappedDevices).toBe(devices);
    expect(service.retornoFront).toBe(retornoFront);
    expect(service.qtdPacketsResend).toBe(0);
  });
  
  it('resetProperties zera dados', () => {
    retornoFront.protocols.tcp = 5;
    retornoFront.taxaTráfego = 123;
    retornoFront.qtdPacotesPerdidos = 2;
    retornoFront.computers[0].packetsIn = 3;
    retornoFront.computers[0].protocols.tcp = 4;

    const service = new PacketsService(buffer, 'link', decoders, retornoFront.computers, retornoFront, 0);
    service.resetProperties();

    expect(retornoFront.taxaTráfego).toBe(0);
    expect(retornoFront.protocols.tcp).toBe(0);
    expect(retornoFront.computers[0].packetsIn).toBe(0);
    expect(retornoFront.computers[0].protocols.tcp).toBe(0);
  });

  it('packetsResend calcula porcentagem e reseta', () => {
    const service = new PacketsService(buffer, 'link', decoders, retornoFront.computers, retornoFront, 2);
    service.packetsResend(4);
    expect(retornoFront.qtdPacotesReenviados).toBe(50);
    expect(service.qtdPacketsResend).toBe(0);
  });

  it('packetsResend com qtdPackets 0 zera valores', () => {
    const service = new PacketsService(buffer, 'link', decoders, retornoFront.computers, retornoFront, 5);
    service.packetsResend(0);
    expect(retornoFront.qtdPacotesReenviados).toBe(0);
    expect(service.qtdPacketsResend).toBe(0);
  });

  it('resetConnections limpa tcpConnections', () => {
    const service = new PacketsService(buffer, 'link', decoders, retornoFront.computers, retornoFront, 0);
    service.tcpConnections.set('k', { sourceIp:'1.1.1.1', destinationIp:'2.2.2.2', sourcePort:1, destinationPort:2, sentPackets:new Map() });
    service.resetConnections();
    expect(service.tcpConnections.size).toBe(0);
  });

  it('updateInputOutput soma corretamente', () => {
    retornoFront.computers[0].packetsIn = 2;
    retornoFront.computers[0].packetsOut = 3;
    retornoFront.computers[1].packetsIn = 1;
    retornoFront.computers[1].packetsOut = 4;

    const service = new PacketsService(buffer, 'link', decoders, retornoFront.computers, retornoFront, 0);
    service.updateInputOutput();
    expect(retornoFront.inputOutput.input).toBe(3);
    expect(retornoFront.inputOutput.output).toBe(7);
  });
});

describe('PacketsService', () => {
  let mockDecoders;
  let testBuffer;
  let retornoFront;
  let mappedDevices;

  beforeEach(() => {
    // Mock dos decoders
    mockDecoders = {
      Ethernet: jest.fn(),
      IPV4: jest.fn(),
      TCP: jest.fn(),
      UDP: jest.fn(),
      PROTOCOL: {
        ETHERNET: { IPV4: 0x0800 },
        IP: { TCP: 6, UDP: 17 },
      },
    };
    testBuffer = Buffer.from('fake data');

    // SETUP ATUALIZADO
    const device1 = createMockDevice('PC1', ['192.168.0.10']);
    const device2 = createMockDevice('Server1', ['192.168.0.20'], 'AA:BB:CC:DD:EE:FF');

    mappedDevices = [device1, device2];

    retornoFront = createCleanRetornoFront();
    retornoFront.computers = mappedDevices;
  });

  const createCleanRetornoFront = () => ({
    qtdPacotesPerdidos: 0,
    qtdPacotesReenviados: 0,
    taxaTráfego: 0,
    protocols: { http: 0, https: 0, ftp: 0, tcp: 0, udp: 0, other: 0 },
    computers: [],
  });

  const createMockDevice = (name, ipv4, mac = null) => ({
    name,
    ipv4,
    mac,
    packetsIn: 0,
    packetsOut: 0,
    protocols: { http: 0, https: 0, ftp: 0, tcp: 0, udp: 0, other: 0 },
    sessions: [], 
    logs: [],
  });

  describe('processPacket()', () => {
    
    it('TCP incrementa protocolos, taxaTráfego, associa MAC e cria logs', () => {
      mockDecoders.Ethernet.mockReturnValue({ info: { type: 0x0800, srcmac: '11:22:33:44:55:66' }, offset: 14 });
      mockDecoders.IPV4.mockReturnValue({ info: { protocol: 6, srcaddr: '192.168.0.10', dstaddr: '192.168.0.20', totallen: 60, hdrlen: 20 }, offset: 34 });
      mockDecoders.TCP.mockReturnValue({ info: { srcport: 12345, dstport: 80, flags: 16, seqno: 1, acknum: 1, hdrlen: 20 } });

      const service = new PacketsService(testBuffer, '', mockDecoders, mappedDevices, retornoFront, 0);

      service.processPacket();

      expect(retornoFront.protocols.tcp).toBe(1);
      expect(retornoFront.protocols.http).toBe(1);
      expect(retornoFront.taxaTráfego).toBe(60);

      const sourceDevice = mappedDevices[0];
      const destDevice = mappedDevices[1];

      expect(sourceDevice.mac).toBe('11:22:33:44:55:66');
      expect(sourceDevice.sessions).toHaveLength(1);
      expect(sourceDevice.sessions[0].status).toBe('NEW');

      // Garante que os logs foram adicionados
      expect(sourceDevice.logs).toHaveLength(1);
      expect(destDevice.logs).toHaveLength(1);
      expect(sourceDevice.logs[0].protocol).toBe('TCP');
      expect(sourceDevice.logs[0].info).toContain('[ACK]'); // Verifica se a info do log está correta
    });
    it('TCP conta pacotes perdidos (flags.reset)', () => {

      mockDecoders.Ethernet.mockReturnValue({ info: { type: 0x0800, srcmac: '...' }, offset: 14 });
      mockDecoders.IPV4.mockReturnValue({ info: { protocol: 6, srcaddr: '192.168.0.10', dstaddr: '192.168.0.20', totallen: 40 }, offset: 34 });

      mockDecoders.TCP.mockReturnValue({ info: { srcport: 1234, dstport: 5678, flags: 4, seqno: 1, acknum: 1, hdrlen: 20 } });

      const service = new PacketsService(testBuffer, '', mockDecoders, mappedDevices, retornoFront, 0);

      service.processPacket();

      expect(retornoFront.qtdPacotesPerdidos).toBe(1);
      expect(mappedDevices[0].sessions).toHaveLength(1);
      expect(mappedDevices[0].sessions[0].status).toBe('CLOSED_RST');
    });
  });
});
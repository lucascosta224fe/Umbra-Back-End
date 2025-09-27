const mockEmit = jest.fn();
const mockOn = jest.fn(); 

// Mock do Socket.IO
jest.mock('../../routes/websocket.ts', () => ({
  io: {
    on: jest.fn(),
    emit: mockEmit,
  },
}));

// Mock do 'cap'
jest.mock('cap', () => ({
  findDevice: jest.fn(),
  deviceList: jest.fn().mockReturnValue([]),
  decoders: {
    PROTOCOL: { ETHERNET: {}, IP: {} },
  },
  Cap: jest.fn().mockImplementation(() => ({
    open: jest.fn(),
    on: mockOn,
    close: jest.fn(),
  })),
}));

jest.mock('../packets.service.ts');

// Importa a referência ao mock que o Jest criou
const { PacketsService } = require('../packets.service');

const mockPacketsServiceInstance = {
  processPacket: jest.fn(),
  updateInputOutput: jest.fn(),
  packetsResend: jest.fn(),
  calculateAverageResponseTime: jest.fn(),
  resetProperties: jest.fn(),
  resetConnections: jest.fn(),
};

describe('SnifferService', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    PacketsService.mockImplementation(() => {
      return mockPacketsServiceInstance;
    });
  });

  it('deve inicializar as propriedades corretamente no construtor', () => {
    const { SnifferService } = require('../sniffer.service');
    const snifferService = new SnifferService();
    expect(snifferService.filter).toBe('tcp port 80 or tcp port 443 or tcp port 20 or tcp port 21 or udp port 20 or udp port 21 or udp port 443 or udp port 80');
    expect(snifferService.cap).toBeDefined();
  });

  describe('para o envio periódico de dados', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('quando existe device: processa pacotes, calcula taxa/5, emite no socket e reseta', () => {
      
      const Cap = require('cap');
      const { SnifferService } = require('../sniffer.service');

      Cap.findDevice.mockReturnValue('\\Device\\NPF_FAKE');

      const snifferService = new SnifferService();
      snifferService.capturePackets();

      // Configura o comportamento da nossa instância para o teste
      mockPacketsServiceInstance.processPacket.mockImplementation(() => {
        snifferService.retornoFront.taxaTráfego += 1000;
      });

      const packetHandler = mockOn.mock.calls.find(([event]) => event === 'packet')[1];

      packetHandler(); // Simula 1º pacote
      packetHandler(); // Simula 2º pacote
      jest.advanceTimersByTime(5000);

      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith('packetData', expect.objectContaining({ taxaTráfego: 400 }));

      expect(mockPacketsServiceInstance.calculateAverageResponseTime).toHaveBeenCalledTimes(1);
      expect(mockPacketsServiceInstance.resetConnections).toHaveBeenCalledTimes(1);
      expect(mockPacketsServiceInstance.resetProperties).toHaveBeenCalledTimes(1);
    });
  });

  describe('quando um dispositivo NÃO é encontrado', () => {
    beforeEach(() => {
      jest.resetModules(); 
    });

    it('deve registrar um erro e sair', () => {

      const CapMock = require('cap');
      CapMock.findDevice.mockReturnValue(null);

      jest.mock('../packets.service.ts'); 

      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => { });
      const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => { });

      const { SnifferService } = require('../sniffer.service');
      const snifferService = new SnifferService();

      snifferService.capturePackets();

      
      expect(mockConsoleError).toHaveBeenCalledWith("Nenhuma interface disponível. Verifique permissão / drivers.");
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      mockProcessExit.mockRestore();
      mockConsoleError.mockRestore();
    });
  });
});
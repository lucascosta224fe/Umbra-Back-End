import { SnifferService } from "./controllers/sniffer.service";

const snifferService = new SnifferService();

snifferService.capturePackets();
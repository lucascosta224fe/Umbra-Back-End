"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sniffer_service_1 = require("./controllers/sniffer.service");
const snifferService = new sniffer_service_1.SnifferService();
snifferService.capturePackets();

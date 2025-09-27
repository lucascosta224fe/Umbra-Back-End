const fs = require("fs");
const path = require("path");
const ftp = require("basic-ftp");
const dgram = require("dgram");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5000);           // porta TCP do FTP
const FTP_USER = process.env.FTP_USER || "admin";
const FTP_PASS = process.env.FTP_PASS || "123";
const REMOTE_FILE = process.env.REMOTE_FILE || "teste.txt";
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "downloads";

const ITERATIONS = Number(process.env.ITERATIONS || 100);
const GET_EVERY_N = Number(process.env.GET_EVERY_N || 10); // a cada N iterações faz GET
const SLEEP_MS = Number(process.env.SLEEP_MS || 200);      // pausa entre conexões (ms)

const UDP_COUNT = Number(process.env.UDP_COUNT || 50);
const UDP_PORT = Number(process.env.UDP_PORT || PORT);     // por padrão usa a mesma porta do FTP
const UDP_DELAY_MS = Number(process.env.UDP_DELAY_MS || 20);

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function ftpOnce(index) {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    client.ftp.socketTimeout = 5000;

    try {
        await client.access({
            host: HOST,
            port: PORT,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false
        });

        process.stdout.write(`[${index}] conectado — LIST... `);
        try {
            const list = await client.list();
            process.stdout.write(`ok (${list.length} itens)\n`);
        } catch (err) {
            process.stdout.write(`LIST erro: ${err.message || err}\n`);
        }

        if (GET_EVERY_N > 0 && index % GET_EVERY_N === 0) {
            fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
            const localName = path.join(DOWNLOAD_DIR, `${REMOTE_FILE.replace(/\.[^/.]+$/, "")}_${index}${path.extname(REMOTE_FILE)}`);
            if (fs.existsSync(localName)) {
                console.log(`[${index}] GET pulado (arquivo já existe): ${localName}`);
            } else {
                process.stdout.write(`[${index}] GET ${REMOTE_FILE} -> ${localName} ... `);
                try {
                    await client.downloadTo(localName, REMOTE_FILE);
                    const size = fs.statSync(localName).size;
                    process.stdout.write(`ok (${size} bytes)\n`);
                } catch (err) {
                    process.stdout.write(`falha: ${err.message || err}\n`);
                    try { if (fs.existsSync(localName)) fs.unlinkSync(localName); } catch(_) {}
                }
            }
        }

        await client.close();
        return { ok: true };
    } catch (err) {
        try { await client.close(); } catch(_) {}
        return { ok: false, error: err.message || err };
    }
}

async function runFtpSequence() {
    console.log(`Iniciando ${ITERATIONS} requisições FTP válidas para ${HOST}:${PORT} (GET a cada ${GET_EVERY_N})`);
    for (let i = 1; i <= ITERATIONS; i++) {
        const res = await ftpOnce(i);
        if (!res.ok) {
            console.warn(`[${i}] ERRO: ${res.error}`);
        }
        if (i < ITERATIONS) await sleep(SLEEP_MS);
    }
    console.log("Conexões FTP finalizadas.");
}

function runUdpSequence() {
    return new Promise((resolve) => {
        console.log(`Iniciando envio de ${UDP_COUNT} datagramas UDP para ${HOST}:${UDP_PORT}`);
        const socket = dgram.createSocket('udp4');
        let sent = 0;

        function sendOne(i) {
            const message = Buffer.from(`UDP_TEST ${i} ${Date.now()}`);
            socket.send(message, UDP_PORT, HOST, (err) => {
                if (err) {
                    console.log(`[UDP ${i}] ERRO: ${err.message}`);
                } else {
                    process.stdout.write(`[UDP ${i}] enviado\n`);
                }
                sent++;
                if (sent === UDP_COUNT) {
                    socket.close(() => {
                        console.log("Todos datagramas UDP enviados; socket fechado.");
                        resolve();
                    });
                }
            });
        }

        // enviar com pequeno intervalo para não saturar
        let i = 1;
        const t = setInterval(() => {
            if (i > UDP_COUNT) {
                clearInterval(t);
                return;
            }
            sendOne(i);
            i++;
        }, UDP_DELAY_MS);

        // segurança: timeout máximo para fechar socket
        setTimeout(() => {
            try { socket.close(); } catch(_) {}
            if (sent < UDP_COUNT) {
                console.log(`Timeout de UDP; enviados ${sent}/${UDP_COUNT}`);
            }
            resolve();
        }, UDP_COUNT * UDP_DELAY_MS + 10000);
    });
}

// === LOOP PRINCIPAL ===
(async function main() {
    try {
        console.log("Digite 'exit' e pressione ENTER para encerrar o script.\n");

        // Listener para sair com 'exit'
        process.stdin.resume();
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (data) => {
            if (data.trim().toLowerCase() === "exit") {
                console.log("Saindo do script a pedido do usuário...");
                process.exit(0);
            }
        });

        while (true) {
            await runFtpSequence();
            await runUdpSequence();
            console.log("Ciclo finalizado — reiniciando...\n");
        }
    } catch (err) {
        console.error("Erro inesperado:", err);
        process.exit(1);
    }
})();

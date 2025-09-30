const fs = require("fs");
const path = require("path");
const dgram = require("dgram");
const axios = require("axios"); 

const HOST = process.env.HOST || "http://127.0.0.1:3000"; 
const REMOTE_PATH = process.env.REMOTE_PATH || "/livros";
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "downloads";

const ITERATIONS = Number(process.env.ITERATIONS || 100);
const GET_EVERY_N = Number(process.env.GET_EVERY_N || 10);
const SLEEP_MS = Number(process.env.SLEEP_MS || 200);

const UDP_COUNT = Number(process.env.UDP_COUNT || 50);
const UDP_PORT = Number(process.env.UDP_PORT || 5000);
const UDP_DELAY_MS = Number(process.env.UDP_DELAY_MS || 20);

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function httpGetOnce(index) {
    const url = `${HOST}${REMOTE_PATH}`;
    console.log(`[${index}] Solicitando GET para ${url}`);

    try {
        const response = await axios.get(url, {
            timeout: 5000,
        });

        if (response.status >= 200 && response.status < 300) {
            console.log(`[${index}] GET ${url} ok (status: ${response.status})`);

            if (GET_EVERY_N > 0 && index % GET_EVERY_N === 0) {
                fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
                const localName = path.join(
                    DOWNLOAD_DIR,
                    `response_${index}.json`
                );
                try {
                    fs.writeFileSync(
                        localName,
                        JSON.stringify(response.data, null, 2),
                        "utf8"
                    );
                    const size = fs.statSync(localName).size;
                    console.log(
                        `[${index}] GET salvo em ${localName} (${size} bytes)`
                    );
                } catch (err) {
                    console.log(
                        `[${index}] Falha ao salvar arquivo: ${
                            err.message || err
                        }`
                    );
                }
            }
        } else {
            console.warn(
                `[${index}] Alerta: Resposta inesperada (status: ${response.status})`
            );
        }
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            error: err.response
                ? `Erro HTTP ${err.response.status}`
                : err.message,
        };
    }
}

async function runHttpSequence() {
    console.log(
        `Iniciando ${ITERATIONS} requisições HTTP válidas para ${HOST} (GET a cada ${GET_EVERY_N})`
    );
    for (let i = 1; i <= ITERATIONS; i++) {
        const res = await httpGetOnce(i);
        if (!res.ok) {
            console.warn(`[${i}] ERRO: ${res.error}`);
        }
        if (i < ITERATIONS) await sleep(SLEEP_MS);
    }
    console.log("Conexões HTTP finalizadas.");
}

function runUdpSequence() {
    return new Promise((resolve) => {
        console.log(
            `Iniciando envio de ${UDP_COUNT} datagramas UDP para ${HOST}:${UDP_PORT}`
        );
        const socket = dgram.createSocket("udp4");
        let sent = 0;

        function sendOne(i) {
            const message = Buffer.from(`UDP_TEST ${i} ${Date.now()}`);
            socket.send(message, UDP_PORT, "127.0.0.1", (err) => {
                if (err) {
                    console.log(`[UDP ${i}] ERRO: ${err.message}`);
                } else {
                    process.stdout.write(`[UDP ${i}] enviado\n`);
                }
                sent++;
                if (sent === UDP_COUNT) {
                    socket.close(() => {
                        console.log(
                            "Todos datagramas UDP enviados; socket fechado."
                        );
                        resolve();
                    });
                }
            });
        }

        let i = 1;
        const t = setInterval(() => {
            if (i > UDP_COUNT) {
                clearInterval(t);
                return;
            }
            sendOne(i);
            i++;
        }, UDP_DELAY_MS);

        setTimeout(() => {
            try {
                socket.close();
            } catch (_) {}
            if (sent < UDP_COUNT) {
                console.log(`Timeout de UDP; enviados ${sent}/${UDP_COUNT}`);
            }
            resolve();
        }, UDP_COUNT * UDP_DELAY_MS + 10000);
    });
}

(async function main() {
    try {
        console.log("Digite 'exit' e pressione ENTER para encerrar o script.\n");

        process.stdin.resume();
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (data) => {
            if (data.trim().toLowerCase() === "exit") {
                console.log("Saindo do script a pedido do usuário...");
                process.exit(0);
            }
        });

        while (true) {
            await runHttpSequence();
            await runUdpSequence();
            console.log("Ciclo finalizado — reiniciando...\n");
        }
    } catch (err) {
        console.error("Erro inesperado:", err);
        process.exit(1);
    }
})();
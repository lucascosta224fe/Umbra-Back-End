# Umbra Backend de Análise de Rede

![Node.js Version](https://img.shields.io/badge/Node.js-v22-339933?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=for-the-badge&logo=typescript)

### Indice

>1. [Objetivo](#objetivo)
>2. [Principais funcionalidades](#principais-funcionalidades)
>3. [Tecnologias Utilizadas](#tecnologias-utilizadas)
>4. [Utilizando o Umbra Backend](#utilizando-o-umbra-backend) </br> 1. [Pré-requisitos](#pré-requisitos) </br> 2. [Instalação](#instalação) </br> 3. [Sniffer](#sniffers) </br> 4. [Server FTP](#server-ftp) </br> 5. [HTTP Server](#http-server)
>5. [Endpoints](#endpoints) </br> 1. [Api Rest (Livros)](#1-api-rest-livros)
>6. [WebSockets (Dados do Sniffer)](#2-websockets-dados-do-sniffer)
>7. [Servidor FTP](#3-servidor-ftp)
>8. [Contatos](#contatos)

Este repositório contém o código-fonte do backend desenvolvido para um sistema multifuncional, combinando análise de tráfego de rede em tempo real, uma API RESTful e um servidor de arquivos FTP.

## Objetivo

Este projeto foi desenvolvido como requisito para a disciplina de **Redes de Computadores**. O objetivo principal é aplicar conceitos teóricos de redes em uma aplicação prática e robusta, demonstrando a capacidade de manipulação e análise de pacotes de dados, além da construção de serviços de rede convencionais.

## Principais Funcionalidades

- **Monitoramento de Rede**: Captura e análise de pacotes em tempo real.
- **Dashboard de Dados**: Envio contínuo de estatísticas de rede via Socket.IO.
- **Gerenciamento de Livros**: API RESTful completa para o controle de um acervo de livros.
- **Transferência de Arquivos**: Servidor FTP para acesso e manipulação de arquivos.
- **Testado e Confiável**: Suíte de testes unitários abrangente utilizando Jest para garantir a qualidade e a estabilidade do código.

## Tecnologias Utilizadas

- **IDE**: VSCode
- **Linguagem**: TypeScript e JavaScript
- **Ambiente de execução**: Node.js
- **Servidor HTTP e Roteamento**: Express.js
- **Comunicação em Tempo Real**: Socket.IO
- **Captura de Pacotes**: node-cap
- **Servidor FTP**: ftp-srv
- **Testes**: Jest e ts-jest

## Utilizando o Umbra Backend

Siga as instruções abaixo para configurar e executar o projeto em seu ambiente local.

### Pré-requisitos

- **[Node.js](https://nodejs.org/pt/download)**: Versão 18 ou mais recente
- **Git**: Para clonar o repositório
- **IDE**:  [Visual Studio Code](https://code.visualstudio.com) certifique-se que as Ferramentas Remotas sejam instaladas
- **Dependências de Captura de Pacote e scripts**:
  - sudo apt install libpcap0.8 libpcap-dev para **linux** ou [npcap](https://npcap-com.translate.goog/?_x_tr_sl=en&_x_tr_tl=pt&_x_tr_hl=pt&_x_tr_pto=tc#download) para **windows**
  - sudo npm i axios para **linux** ou npm i axios para **windows**

### Instalação

1. Clone o repositório:

   ```bash
    git clone https://github.com/lucascosta224fe/Umbra-Back-End.git
   ```

2. Entre na pasta ``Umbra-Back-End``

### Sniffers

Para rodar:

1. Entre na pasta ``Sniffer``
2. Digite ``npm i`` no terminal

Para consumir

1. Entre na pasta ``src/controllers``
   1. Abra o arquivo sniffer.service.ts
   2. Identifique a linha 110 ``const device = Cap.findDevice("192.168.15.5");``
   3. E substitua o trecho 192.168.15.5 pelo seu **Endereço IPv4**
2. Volte para a pasta ``Sniffer``
3. Por fim rode o programa utilizando ``npm run dev``

Caso queira rodar os testes basta utilizar ``npm run test``

Também existe a possibilidade de analisar outro protocolo e outras portas para isso faça o seguinte:

1. No arquivo sniffer.service.ts
2. Encontre a linha 20/21 ``this.filter``, nela está sendo feita a configuração de protocolo e de porta. Altere para o protocolo e porta que deseja ``{Protocolo} port {Porta}``
3. Para analisar toda a rede deixe vazio ``""``

Atualmente estamos trabalhando com endereços estáticos e adicionamos os dispositivos manualmente em:

1. Entre no arquivo ``src/controllers/sniffer.service.ts``
2. As informações para o dispositivo de análise ficam da linha 89 a 108 e estão comentadas.

### Server FTP

Para rodar:

1. Entrar na pasta ``FTP Server``
2. Rode o comando ``npm i basic-ftp``
3. Digite ```node src/server.js``` no terminal

4. Digite ```ftp localhost 5000```
5. Informar o name ```admin``` e password ```123```
6. digitar ```get```
7. o nome do arquivo do servidor ```teste.txt```
8. o nome do arquivo local ```arquivo```

Caso queira mudar o loopback é simples:

1. No arquivo ``server.js``
2. Mude o loopback, na linha 6 em ``"ftp://127.0.01" + port`` pelo IP da máquina e a porta que deseja

Caso queira usar o sprint:

1. No arquivo ``sprint.js``
2. Identifique a linha 6 ``const HOST = process.env.HOST || "127.0.0.1";`` altere o HOST para o IP da máquina do FTPServer e na linha 7 ``const PORT = Number(process.env.PORT || 5000);`` altere a porta para a que deseja!

### HTTP Server

Para rodar:

1. Entre na pasta ``HTTP Server``
2. Digite ``npm i`` e ``npm i axios`` no teminal
3. Digite ``npm run dev`` no teminal
4. E rode também ``node src/controllers/http_client.js``

Caso queira rodar os testes basta utilizar ``npm run test``

Existem a possibilidade de trocar a porta em que o servidor está rodando:

1. Entre no arquivo ``src/index.ts``
2. E na linha 8 ``const PORT = 3000`` altere para a porta que deseja.

E também pode escolher o HOST do servidor:

1. Entre no arquivo ``src/controllers/http_client.js``
2. Na linha 6 ``const HOST = process.env.HOST || "http://127.0.0.1:3000";`` e altere para o HOST desejado.

## Endpoints

O sistema expõe três serviços principais que podem ser consumidos por um front-end.

### 1. Api Rest (Livros)

A API para gerenciamento de livros está disponível no endpoint base ``/livros``.

| Método   | Endpoint      | Descrição                                      |
| :------- | :------------ | :--------------------------------------------- |
| `GET`    | `/livros`     | Lista todos os livros cadastrados.             |
| `GET`    | `/livros/:id` | Busca um livro específico pelo seu ID.         |
| `POST`   | `/livros`     | Adiciona um novo livro ao acervo.              |
| `PUT`    | `/livros/:id` | Atualiza as informações de um livro existente. |
| `DELETE` | `/livros/:id` | Remove um livro do acervo.                     |

## 2. WebSockets (Dados do Sniffer)

O servidor emite eventos em tempo real com as estatísticas da rede. Um cliente front-end deve se conectar ao servidor Socket.IO e ouvir pelo evento packetData.

- **Evento**: ``packetData``
- **Payload (Dados)**:  objeto JSON contendo todas as métricas de rede, com uma estrutura similar a:

    ````json
    {
    "qtdComputadores": 2,
    "qtdPacotesPerdidos": 5,
    "qtdPacotesReenviados": 10,
    "taxaTráfego": 1500.75, // em bytes/s
    "tempoMedioResposta": 45.5, // em ms
    "computers": [
        {
        "name": "MeuPC",
        "ipv4": ["192.168.15.5"],
        "mac": "AA:BB:CC:DD:EE:FF",
        "packetsIn": 120,
        "packetsOut": 300,
        "protocols": { "http": 50, "https": 70, /* ... */ },
        "lineChartData": [ /* ... */ ],
        "sessions": [ /* ...  */ ]
        }
    ],
    "protocols": { "http": 100, "https": 250, /* ... */ },
    "inputOutput": { "input": 500, "output": 1200 }
    }

## 3. Servidor FTP

O servidor FTP está disponível para acesso a arquivos.

- **Host**: ``127.0.0.1``
- **Porta**: ``5000``
- **Credenciais**:
  - **Login anônimo**: Habilitado (``anonymous: true``)
  - **Login com usuário**: ``admin``
  - **Senha**: ``123``
  - **Diretório Raiz (após login)**: ``./src/arquivos``

## Contatos

Nossa Equipe:

- **Pedro Costa** [FrontEnd]: <https://github.com/Batsy13>
- **Nathan** [FrontEnd]: <https://github.com/Nathaan30>
- **Gabriel Peixoto** [FrontEnd]: <https://github.com/HitokiriGD>
- **Ironildo** [BackEnd]: <https://github.com/Ironildo-Jr>
- **Gabriel Rodrigues** [BackEnd]: <https://www.github.com/GabrielRoOl>
- **Paulo** [BackEnd]: <https://github.com/PSRprogam>
- **Lucas Costa** [BackEnd/Segurança]: <https://github.com/lucascosta224fe>
- **Felipe** [Backend]: <https://github.com/FelipeLucas16>

Contribuidores deste repositório:

<a href="https://github.com/lucascosta224fe/Umbra-Back-End/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=lucascosta224fe/Umbra-Back-End" />
</a>

</br>

[Volte para o topo](#umbra-backend-de-análise-de-rede)

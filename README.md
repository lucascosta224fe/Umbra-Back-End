# Umbra Backend de Análise de Rede

![Node.js Version](https://img.shields.io/badge/Node.js-v22-339933?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=for-the-badge&logo=typescript)

    
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
- **[Node.js](https://nodejs.org/pt/download)**: Versão 22 
- **IDE**:  [Visual Studio Code](https://code.visualstudio.com) certifique-se que as Ferramentas Remotas sejam instaladas
- **Dependências de Captura de Pacote**: 
  - sudo apt install libpcap0.8 libpcap-dev para **linux** ou [npcap](https://npcap-com.translate.goog/?_x_tr_sl=en&_x_tr_tl=pt&_x_tr_hl=pt&_x_tr_pto=tc#download) para **windows**


### Instalação

1. Clone o repositório:
   ```bash
    git clone https://github.com/lucascosta224fe/Umbra-Back-End.git
   ```
2. Entre na pasta ``Umbra-Back-End``

### HTTP Server

Para rodar:

1. Entre na pasta ``HTTP Server``
2. Digite ``npm i`` no teminal
3. Digite ``npm run dev`` no teminal

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

### Server FTP

Para rodar: 

1. Entrar na pasta FTP Server
2. Digitar ```node src/server.js``` no terminal

Para consumir:

1. Digitar ```ftp localhost 5000```
2. Informar o name ```admin``` e password ```123```
3. digitar ```get```
4. o nome do arquivo do servidor ```teste.txt```
5. o nome do arquivo local ```arquivo```

### Endpoints

O sistema expõe três serviços principais que podem ser consumidos por um front-end.

## 1. Api Rest (Livros)
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
    ```

### 3. Servidor FTP

O servidor FTP está disponível para acesso a arquivos.

- **Host**: ``127.0.0.1``
- **Porta**: ``5000``
- **Credenciais**:
  - **Login anônimo**: Habilitado (``anonymous: true``)
  - **Login com usuário**: ``admin``
  - **Senha**: ``123``
  - **Diretório Raiz (após login)**: ``./src/arquivos``


## Rodando Testes
Para executar a suíte de testes unitários e garantir que tudo está funcionando como esperado, rode o comando:
```bash
    npm run test
```
import { Request, Response } from "express";
import { escreverNoBanco } from '../utils/database.handler';
import livrosData from '../data/bdLivros.json'
import { Livro } from '../models/livro.interface';
import { sendBadRequest, sendCreated, sendNotFound, sendOk } from "../utils/response.handler";


let dbLivros: Livro[] = livrosData;

export const listarLivros = (req: Request, res: Response) => {
    res.json(dbLivros)
}

export const obterLivroPorId = (req: Request, res: Response) => {

    const livroIdProcurado = parseInt(req.params.id, 10);
    const livroEncontrado = dbLivros.find(livro => livro.id === livroIdProcurado);

    if (livroEncontrado) {
        sendOk(res, livroEncontrado); // Resposta 200 OK
    } else {
        sendNotFound(res, "Livro não encontrado."); // Resposta 404 Not Found
    }

    res.json(livroEncontrado)
}

export const criarLivro = (req: Request, res: Response) => {
    try {
        const { titulo, autor, valor } = req.body;

        if (!titulo || !autor) {
            return sendBadRequest(res, "Título e Autor são obrigatórios.");
        }

        const maiorId = dbLivros.reduce((maxIdAtual, livro) => livro.id > maxIdAtual ? livro.id : maxIdAtual, 0);
        const novoId = maiorId + 1;

        const novoLivro: Livro = {
            id: novoId,
            titulo: titulo,
            autor: autor,
            valor: valor,
        };

        dbLivros.push(novoLivro);

        escreverNoBanco(dbLivros);
        sendCreated(res, novoLivro);

    }
    catch (error) {
        console.error("Erro no controller criarLivro:", error);
        res.status(500).json({ mensagem: "Erro interno no servidor." });
    }

}

export const atualizarLivro = (req: Request, res: Response) => {
    const idParaAtualizar = parseInt(req.params.id, 10);
    const { titulo, autor, valor } = req.body;
    const indiceDoLivro = dbLivros.findIndex(livro => livro.id === idParaAtualizar);

    if (indiceDoLivro === -1) {
        return sendNotFound(res, "Livro não encontrado para atualização.");
    }

    if (!titulo || !autor) {
        return sendBadRequest(res, "Título e Autor são obrigatórios para a atualização.");
    }

    const livroAtualizado: Livro = {
        id: idParaAtualizar, // Mantém o ID original
        titulo: titulo,
        autor: autor,
        valor: valor
    };

    dbLivros[indiceDoLivro] = livroAtualizado;

    escreverNoBanco(dbLivros);
    sendOk(res, livroAtualizado);
};
// Em: src/controllers/request.ts

// ... (seus outros imports)

export const deletarLivro = (req: Request, res: Response) => {
    const idParaDeletar = parseInt(req.params.id, 10);
    const indiceDoLivro = dbLivros.findIndex(livro => livro.id === idParaDeletar);

    if (indiceDoLivro === -1) {
        return sendNotFound(res, "Livro não encontrado para deleção.");
    }

    dbLivros.splice(indiceDoLivro, 1);
    escreverNoBanco(dbLivros);
    res.status(204).send();
};
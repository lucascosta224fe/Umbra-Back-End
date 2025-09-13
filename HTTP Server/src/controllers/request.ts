import { Request, Response } from "express";
import livrosData from '../utils/bdLivros.json'
import { Livro } from '../models/livro.interface';
import {sendBadRequest, sendCreated, sendNotFound, sendOk } from "../utils/response.handler";


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
 
    const {titulo, autor } = req.body;

    if(!titulo || !autor) {
        return sendBadRequest(res, "Título e Autor são obrigatórios.");
    }

    const novoLivro : Livro = req.body;

    
    dbLivros.push(novoLivro);

    sendCreated(res, novoLivro);
}
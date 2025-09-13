import { Response } from 'express';

export const sendOk = (res: Response, data: any) => {
    res.status(200).json(data);
};

export const sendCreated = (res: Response, data: any) => {
    res.status(201).json(data);
};

export const sendBadRequest = (res: Response, message: string = "Requisição inválida.") => {
    res.status(400).json({ mensagem: message });
};


export const sendNotFound = (res: Response, message: string = "Recurso não encontrado.") => {
    res.status(404).json({ mensagem: message });
};


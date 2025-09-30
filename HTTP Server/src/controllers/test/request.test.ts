import { getMockReq, getMockRes } from '@jest-mock/express';
import { Request, Response } from 'express'; // Podemos importar tipos!

// Mock das dependências externas
jest.mock('../../utils/database.handler', () => ({
    escreverNoBanco: jest.fn(),
}));
jest.mock('../../utils/response.handler', () => ({
    sendOk: jest.fn(),
    sendCreated: jest.fn(),
    sendNotFound: jest.fn(),
    sendBadRequest: jest.fn(),
}));

// Importa as funções que vamos testar
import livrosData from '../../data/bdLivros.json'; // O Jest consegue importar JSON diretamente
import { escreverNoBanco } from '../../utils/database.handler';
import { sendBadRequest, sendCreated, sendNotFound, sendOk } from '../../utils/response.handler';
import { atualizarLivro, criarLivro, deletarLivro, listarLivros, obterLivroPorId } from '../request';

describe('Controladores de Livros', () => {
    let req: Request;
    let res: Response;

    beforeEach(() => {
        jest.clearAllMocks();
        req = getMockReq();
        const { res: mockRes } = getMockRes();
        res = mockRes;
    });

    describe('listarLivros (GET /livros)', () => {
        it('deve retornar a lista completa de livros', () => {
            listarLivros(req, res);
            expect(res.json).toHaveBeenCalledWith(livrosData);
        });
    });

    describe('obterLivroPorId (GET /livros/:id)', () => {
        it('deve retornar um livro quando o ID existe', () => {
            req.params.id = '1';
            const livroEsperado = livrosData.find(l => l.id === 1);

            obterLivroPorId(req, res);

            expect(sendOk).toHaveBeenCalledWith(res, livroEsperado);
        });

        it('deve retornar 404 quando o ID não existe', () => {
            req.params.id = '999';

            obterLivroPorId(req, res);

            expect(sendNotFound).toHaveBeenCalledWith(res, "Livro não encontrado.");
        });
    });

    describe('criarLivro (POST /livros)', () => {
        it('deve criar um novo livro e retornar 201', () => {

            req.body = { titulo: 'O Hobbit', autor: 'J.R.R. Tolkien', valor: 50 };
            criarLivro(req, res);

            expect(sendCreated).toHaveBeenCalled();

            const livroCriado = (sendCreated as jest.Mock).mock.calls[0][1];
            expect(livroCriado).toEqual(expect.objectContaining({
                id: expect.any(Number),
                titulo: 'O Hobbit',
                autor: 'J.R.R. Tolkien',
            }));
            expect(escreverNoBanco).toHaveBeenCalled();
        });

        it('deve retornar 400 se o título ou autor não forem fornecidos', () => {

            req.body = { valor: 50 }; // Faltando título e autor

            criarLivro(req, res);

            expect(sendBadRequest).toHaveBeenCalledWith(res, "Título e Autor são obrigatórios.");
            expect(escreverNoBanco).not.toHaveBeenCalled();
        });
    });

    describe('atualizarLivro (PUT /livros/:id)', () => {
        it('deve atualizar um livro existente e retornar 200', () => {
            
            req.params.id = '2';
            req.body = { titulo: '1984 - Edição Revisada', autor: 'George Orwell', valor: 45 };

            atualizarLivro(req, res);

            expect(sendOk).toHaveBeenCalled();
            const livroAtualizado = (sendOk as jest.Mock).mock.calls[0][1];
            expect(livroAtualizado.titulo).toBe('1984 - Edição Revisada');
            expect(escreverNoBanco).toHaveBeenCalled();
        });

        it('deve retornar 404 se o livro a ser atualizado não existe', () => {

            req.params.id = '999';
            req.body = { titulo: 'Inexistente', autor: 'Fantasma' };
            atualizarLivro(req, res);

            expect(sendNotFound).toHaveBeenCalledWith(res, "Livro não encontrado para atualização.");
            expect(escreverNoBanco).not.toHaveBeenCalled();
        });
    });

    describe('deletarLivro (DELETE /livros/:id)', () => {
        it('deve deletar um livro existente e retornar 204', () => {
            req.params.id = '3';

            deletarLivro(req, res);

            expect(res.status).toHaveBeenCalledWith(204);
            expect(res.send).toHaveBeenCalled();
            expect(escreverNoBanco).toHaveBeenCalled();
        });

        it('deve retornar 404 se o livro a ser deletado não existe', () => {
            req.params.id = '999';

            deletarLivro(req, res);

            expect(sendNotFound).toHaveBeenCalledWith(res, "Livro não encontrado para deleção.");
            expect(escreverNoBanco).not.toHaveBeenCalled();
        });
    });


});

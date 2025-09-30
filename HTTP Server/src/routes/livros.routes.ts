import {Router, Request, Response} from 'express';
import { atualizarLivro, criarLivro, deletarLivro, listarLivros, obterLivroPorId } from '../controllers/request'

const livrosRouter = Router();

livrosRouter.get("/", (req: Request, res: Response) => {
    res.send("Server is running just fine!")
});

livrosRouter.get('/livros', listarLivros);
livrosRouter.get('/livros/:id', obterLivroPorId);
livrosRouter.post('/livros', criarLivro);
livrosRouter.put('/livros/:id', atualizarLivro);    
livrosRouter.delete('/livros/:id', deletarLivro); 

export default livrosRouter;
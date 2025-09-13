import {Router, Request, Response} from 'express';
import { listarLivros, obterLivroPorId } from '../controllers/request'

const livrosRouter = Router();

livrosRouter.get("/", (req: Request, res: Response) => {
    res.send("Server is running just fine!")
});

livrosRouter.get('/livros', listarLivros)

livrosRouter.get('/livros/:id', obterLivroPorId)

export default livrosRouter;
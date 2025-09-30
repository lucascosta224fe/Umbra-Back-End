
import fs from 'fs';
import path from 'path'; 
import { Livro } from '../models/livro.interface'; 

const dbPath = path.resolve(__dirname, '../data/bdLivros.json');

export const escreverNoBanco = (dados: Livro[]) => {
    try {
        const dadosString = JSON.stringify(dados, null, 2);
        fs.writeFileSync(dbPath, dadosString);
        console.log("Banco de dados atualizado com sucesso!"); 

    } catch (error) {
        console.error("ERRO ao escrever no banco de dados:", error);
        throw new Error("Não foi possível salvar os dados no arquivo.");
    }
};
import express from "express"
import livrosRouter from "./routes/livros.routes";

const app = express();

app.use(express.json());

const PORT = 3000

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

app.use('/', livrosRouter);

export default app; 
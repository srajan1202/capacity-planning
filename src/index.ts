import express, { Request, Response } from "express"
import cors from "cors"
import dotenv from "dotenv"
import capacityPlanningRoutes from "./routes/elastic-routes"

const app = express()

dotenv.config()
app.use(cors())
app.use(express.json())

const port = process.env.PORT || 3000

app.get("/health", (req: Request, res: Response) => {
	res.send({
		message: "Server is healthy! 🚀",
	})
})

app.use("/api/v1", capacityPlanningRoutes)

app.listen(port, () => {
	console.log("Server started at port 3000")
})

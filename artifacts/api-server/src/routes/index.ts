import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import filesRouter from "./files";
import pythonRouter from "./python";
import aiRouter from "./ai";
import helpRouter from "./help";
import adminRouter from "./admin";
import adventureRouter from "./adventure";
import programsRouter from "./programs";
import promptsRouter from "./prompts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(filesRouter);
router.use(pythonRouter);
router.use(aiRouter);
router.use(helpRouter);
router.use(adminRouter);
router.use(adventureRouter);
router.use(programsRouter);
router.use(promptsRouter);

export default router;

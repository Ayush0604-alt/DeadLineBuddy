/**
 * Task Routes
 */

const express        = require("express");
const router         = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { validate, schemas } = require("../middleware/validationMiddleware");
const {
    createTask,
    getTasks,
    deleteTask,
    updateTask
} = require("../controllers/taskController");

router.post(  "/",    authMiddleware, validate(schemas.createTask), createTask);
router.get(   "/",    authMiddleware, getTasks);
router.patch( "/:id", authMiddleware, updateTask);
router.delete("/:id", authMiddleware, deleteTask);

module.exports = router;
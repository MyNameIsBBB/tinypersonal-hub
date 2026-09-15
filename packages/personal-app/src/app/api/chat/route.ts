import { handleDeleteChat, handleGetChat, handlePostChat } from "./controller";

export const maxDuration = 600;

export const GET = handleGetChat;
export const POST = handlePostChat;
export const DELETE = handleDeleteChat;

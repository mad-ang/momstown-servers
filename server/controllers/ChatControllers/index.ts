import Chat from '../../models/Chat';
import { Socket } from 'socket.io';
import { io } from '../..';
import { v4 as uuidV4 } from 'uuid';
import { Request, Response } from 'express';
import { updateRoomId } from '../LastChatControllers';
import { userMap } from '../..';
const rooms: Record<string, string[]> = {};
const rooms_chat: Record<string, Array<Object>> = {};
interface IRoomParams {
  roomId: string;
  userId: string;
  friendId: string;
}

const time_diff = 9 * 60 * 60 * 1000;

const createRoom = () => {
  const roomId = uuidV4();
  rooms[roomId] = [];
  rooms_chat[roomId] = [];
  // socket.emit('room-created', { roomId });
  console.log('chatroom[', roomId, '] created.');
  return roomId;
};

export const requestRoom = (req: Request, res: Response) => {
  const user = req.body;
  let roomId = user.roomId;
  console.log(roomId);
  if (rooms[roomId]) {
    console.log('user Joined the room.', roomId, user.userId);
    rooms[roomId].push(user.userId);
  } else {
    roomId = createRoom();
    updateRoomId({ myId: user.userId, friendId: user.friendId, roomId: roomId }).then(() => {
      rooms[roomId].push(user.userId);
    });
  }
  if (rooms[roomId]) res.status(200).send({ roomId: roomId });
};

export const chatController = (socket: Socket) => {
  // const createRoom = () => {
  //   const roomId = uuidV4();
  //   rooms[roomId] = [];
  //   rooms_chat[roomId] = [];
  //   // socket.emit('room-created', { roomId });
  //   console.log('chatroom[', roomId, '] created.');
  //   return roomId;
  // };
  const joinRoom = (host: { roomId: string; userId: string; friendId: string }) => {
    let { roomId } = host;
    const { userId, friendId } = host;
    console.log("before join Room", roomId);
    
    // const roomId = createRoom();
    if (rooms[roomId]) {
      console.log('user Joined the room', roomId, userId);
      // console.log('user Joined the room.', roomId, host);
      // rooms[roomId].push(host.userId);
      // socket.to(roomId).emit('get-roomId', { roomId });
      rooms[roomId].push(userId);
      socket.join(roomId);
      // socket.emit('get-users', { roomId, participants: rooms[roomId] });
    } else {
      roomId = createRoom();
      updateRoomId({ myId: userId, friendId: friendId, roomId: roomId }).then(() => {
        userMap.get(friendId)?.emit('updata-room-id');
        rooms[roomId].push(userId);
      });
    }
    readMessage({roomId, userId, friendId});
    socket.on('disconnect', () => {
      console.log('user left the room', host);
      leaveRoom({ roomId, userId: userId, friendId });
    });
  };

  const leaveRoom = ({ roomId, userId: userId, friendId: guestId }: IRoomParams) => {
    rooms[roomId] = rooms[roomId].filter((id) => id !== userId);
    socket.to(roomId).emit('user-disconnected', userId);
  };
  const startChat = ({ roomId, userId: userId, friendId: guestId }: IRoomParams) => {
    socket.to(roomId).emit('uesr-started-chat', userId);
  };
  const stopChat = (roomId: string) => {
    socket.to(roomId).emit('user-stopped-chat');
  };

  const sendMessage = (obj: {
    // id: number;
    roomId: string;
    userId: string;
    friendId: string;
    message: string;
  }) => {
    const { roomId, userId: senderId, friendId: receiverId, message } = obj;
    if (message)
      // rooms_chat[roomId].push(message);
    addChatMessage({ senderId: senderId, receiverId: receiverId, message: message });
    // LastChat.
    console.log(roomId, socket.id);
    io.to(roomId).except(socket.id).emit('message', obj)
    // io.to(roomId).emit('message', obj)
    // socket.emit('message',obj)
    // socket.to(roomId).except(socket.id).emit('message', obj);
    // console.log(socket.in(roomId).except(socket.id).emit('message', obj))
    // console.log( result);
    
    // socket.to(roomId).emit('message', obj);
  };
  // room이 살아 있을 경우.
  // Array를 만들고 거기에 푸쉬. Array를 만들어서 룸 데이터로 가지고 있는다.
  // 메시지를 읽으려 할때 그 array를 리턴.
  // room에 처음 참여하는 경우는 db에서 불러온 값을 그대로 보여줌.
  const readMessage = (message: { roomId: string; userId: string; friendId: string }) => {
    const { roomId, userId, friendId } = message;
    // if (rooms_chat[roomId]) {
    //   socket.to(roomId).emit('check-private-message', rooms_chat[roomId]);
    // } else {
    console.log('check readMessage');

    getChatMessage(userId, friendId)
      .then((chatMessage) => {
        console.log('chatroomId after getChatMessage:', roomId);
        // console.log(chatMessage);
        
        rooms_chat[roomId] = chatMessage;
        // socket.to(roomId).emit('show-messages', chatMessage);
        socket.emit('show-messages', chatMessage);
      })
      .catch((error) => {
        console.log(error);
      });
    // }
  };

  // socket.on("create-room", createRoom);
  socket.on('join-room', joinRoom);
  
  // socket.on('start-chat', startChat);
  // socket.on('stop-chat', stopChat);
  socket.on('show-messages', readMessage);
  socket.on('message', sendMessage);
};
// join-room
// show-messages
// message

export const addChatMessage = (message: {
  senderId: string;
  receiverId: string;
  message: string;
}) => {
  let cur_date = new Date();
  let utc = cur_date.getTime() + cur_date.getTimezoneOffset() * 60 * 1000;
  let createAt = utc + time_diff;
  const result = Chat.collection.insertOne({
    senderId: message.senderId,
    receiverId: message.receiverId,
    message: message.message,
    createdAt: createAt,
  });
  console.log('in addChatresult', createAt);
};

export const getChatMessage = async (sender: string, recipient: string) => {
  let result = new Array();
  await Chat.collection
    .find({
      $or: [
        { $and: [{ senderId: sender }, { receiverId: recipient }] },
        { $and: [{ senderId: recipient }, { receiverId: sender }] },
      ],
    })
    .limit(200)
    .sort({ _id: 1 })
    .toArray()
    .then((elem) => {
      elem.forEach((json) => {
        result.push(json);
      });
    });
  return result;
};

import {Ice, Glacier2} from "npm:ice"
import { App } from 'https://deno.land/x/rpc@0.2.1/app.ts'
// @ts-types="./protocol/generated/MumbleServer.d.ts"
import {MumbleServer} from "./protocol/generated/MumbleServer.js" 
import {MumbleBridgeRPC} from "./rpc.ts"
import { handleRpc } from "npm:typed-rpc/server";
class MumbleHandler extends MumbleServer.ServerCallback{
  override userConnected(state: MumbleServer.User, current: Ice.Current): PromiseLike<void> | void {
    console.log(`user ${state.name} connected`)
  }
  override userDisconnected(state: MumbleServer.User, current: Ice.Current): PromiseLike<void> | void {
    console.log(`user ${state.name} disconnected`);
  }
  override userStateChanged(state: MumbleServer.User, current: Ice.Current): PromiseLike<void> | void {
    console.log(`user ${state.name} changed state`)
  }
  override userTextMessage(state: MumbleServer.User, message: MumbleServer.TextMessage, current: Ice.Current): PromiseLike<void> | void {
    console.log(message.text);
  }
  override channelCreated(state: MumbleServer.Channel, current: Ice.Current): PromiseLike<void> | void {
    
  }
  override channelRemoved(state: MumbleServer.Channel, current: Ice.Current): PromiseLike<void> | void {
    
  }
  override channelStateChanged(state: MumbleServer.Channel, current: Ice.Current): PromiseLike<void> | void {
    
  }

}
async function main(){
    let communicator: Ice.Communicator | undefined = undefined;
    let taskRefresh : number | undefined = undefined;
    let server: MumbleServer.ServerPrx;
    try{
        const initData = new Ice.InitializationData();
        initData.properties = Ice.createProperties([], initData.properties);
        initData.properties.setProperty('Ice.ImplicitContext', 'Shared');
        //initData.properties.setProperty('Ice.Default.EncodingVersion', '1.0');
        //initData.properties.setProperty('Ice.Default.Router', 'Glacier2/router:tcp -h 127.0.0.1 -p 6503');
        
        initData.properties.setProperty('Murmur.Meta', 'Meta:tcp -h 127.0.0.1 -p 6502');
        //initData.properties.setProperty('Murmur.Callbacks.Router', 'Glacier2/router:tcp -h 127.0.0.1 -p 6503');
        //initData.properties.setProperty('Murmur.Callbacks', 'tcp -h 127.0.0.1 -p 6504');
        communicator = Ice.initialize(initData);
        //const router = await Glacier2.RouterPrx.checkedCast(communicator.getDefaultRouter());
        const context = new Map();
        const token = (await Deno.readTextFile("mumble_token.txt")).trim();
        context.set("secret", token);
        //router.ice_context(context);
        //const session = await router.createSession("mumblebridge", "mumblebridge");
        //console.log(session);
        //const mumbleSession = await router.getServerProxy();
        const base = communicator.propertyToProxy("Murmur.Meta");
        const mumble : MumbleServer.MetaPrx | null = await MumbleServer.MetaPrx.checkedCast(base);
        communicator.getImplicitContext().setContext(context);

        const version = await mumble.getVersion();
        console.log(`Mumble version: ${version[3]}`);
        server = await mumble.getServer(1);
        const channels = await server.getChannels();
        console.log(`Channels: ${channels.entries().map(c => c[1].name).reduce((a,b) => a + ", " + b)}`);
        //const router = communicator.getDefaultRouter();
        const router = await Glacier2.RouterPrx.checkedCast(communicator.stringToProxy('Glacier2/router:tcp -h 127.0.0.1 -p 6503'));
        await router.createSession("mumblebridge", "mumblebridge");
        
        //console.log(session);
        const adapter = await communicator.createObjectAdapterWithRouter("", router);
        await adapter.activate();
        const identity = new Ice.Identity("callbackReceiver", await router.getCategoryForClient());
        taskRefresh = setInterval(()=>{
            console.log("Refreshing session");
            router.refreshSession();
        }, 10000)
        const callbackPrxRaw = adapter.add(new MumbleHandler(), identity);
        //await router.addProxies([callbackPrxRaw]);
        
        console.log("Adapter created")
        if(!callbackPrxRaw){
            throw new Error("Failed to add callback proxy");
        }
        //console.log(callbackPrxRaw);
        const callbackPrx = await MumbleServer.ServerCallbackPrx.uncheckedCast(callbackPrxRaw);
        if(!callbackPrx){
            throw new Error("Failed to create callback proxy");
        }
        console.log("Callback proxy created");
        await server.addCallback(callbackPrx);
        //await server.sendMessageChannel(0, true, "Hello, world!");

    }catch(err){
        console.error(err);
    }
    if(!communicator){
        console.log("Communicator is null. Exit.");
        return;
    }
    // api server
    console.log("Starting API Server...");
    //const app = new App();
    const service: MumbleBridgeRPC = {
        getUsers: async ()=>{
            const users = await server.getUsers();
            const channelUsers: Map<number, string[]> = new Map();
            const channels = await server.getChannels();
            for(const user of users.values()){
                if(user.name==="botamusique"){
                    continue;
                }
                const channel = user.channel ?? "Unknown";
                if(!channelUsers.has(channel)){
                    channelUsers.set(channel, []);
                }
                channelUsers.get(channel)!.push(user.name);
            }
            return Array.from(channelUsers.entries()).map(([channel, users])=>{
                const channelName = channels.get(channel)!.name;
                return {
                    channel: channelName,
                    users: users
                }
            })
        }
    }
    const handler = async (req: Request) => {
        const json = await req.json();
        const data = await handleRpc(json, service)
        return new Response(JSON.stringify(data), {
            headers: {
              "content-type": "application/json;charset=UTF-8",
            },
          });
    }
    

    const app = Deno.serve({port: 6505, hostname: "127.0.0.1"}, handler);
    console.log("API Server started");
    Deno.addSignalListener("SIGINT", async () => {
        clearInterval(taskRefresh);
        console.log("\nSIGINT detected, Shutting down Mumble ICE Client...");
        await communicator.destroy();
        app.shutdown();
        console.log("Mumble ICE Client down.");
        Deno.exit();
    });
    //await communicator?.waitForShutdown();

}


export function add(a: number, b: number): number {
    return a + b;
}

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
    await main();
}

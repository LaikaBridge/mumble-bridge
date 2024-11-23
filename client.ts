import { connect } from 'https://deno.land/x/jsonrpc@1.1.0/client.ts'
const connection = await connect('http://127.0.0.1:6505', [])
const x = await connection.call("getUsers", []);
console.log(x);
Deno.exit();
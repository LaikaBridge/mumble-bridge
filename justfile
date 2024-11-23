all:
    just --list
generate_ice:
    slice2js protocol/MumbleServer.ice -I $SLICE_INCLUDE_ROOT --typescript --output-dir protocol/generated
run:
    deno --allow-net --allow-read main.ts
client:
    deno --allow-net client.ts
glacier2:
    LD_LIBRARY_PATH=$ZEROC_ICE_LIB glacier2router --Ice.Config=./glacier.conf
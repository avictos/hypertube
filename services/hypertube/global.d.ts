// global.d.ts
declare module "bittorrent-dht" {
    import { EventEmitter } from "events";

    interface DHTOptions {
        nodeId?: string | Buffer;
        host?: string | boolean;
        concurrency?: number;
        dht?: boolean;
        maxPeers?: number;
    }

    class DHT extends EventEmitter {
        constructor(opts?: DHTOptions);
        listen(port: number, cb?: () => void): void;
        destroy(cb?: () => void): void;
        addNode(node: string | { host: string; port: number }): void;
    }

    export = DHT;
}

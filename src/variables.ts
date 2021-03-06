import { allowedNodeEnvironmentFlags } from "process";
import { Type, Types } from "./types";

export class Variable {
    name: string;
    depth: number;
    type: Type;
    mutable: boolean = false;
    used: boolean = false;

    constructor(name: string, type: Type, depth: number) {
        this.name = name;
        this.type = type;
        this.depth = depth;
    }
}

export class Variables {
    static depth = 0;
    static all: Variable[] = [ ];

    static push() {
        this.depth++;
    }

    static pop() {
        this.depth--;
        const removed = this.all.filter(x => x.depth > this.depth);
        // for (const variable of removed) {
        //     if(!Types.isDefinite(variable.type))
        //         throw "Unable to infer the ty"
        // }
        this.all = this.all.filter(x => x.depth <= this.depth);
        Types.generics = Types.generics.filter(x => x.depth <= this.depth);
    }

    static get(name: string) {
        const found = this.all.sort((a, b) => b.depth - a.depth).find(x => x.name == name);
        if(!found)
            throw "Variable not found: " + name;
        return found;
    }
}
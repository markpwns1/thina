import { plainToClass, plainToClassFromExist, Type } from "class-transformer";
import { exception } from "console";
import { Variables } from "./variables";

export type Type = PrimitiveType 
    | TypeRef 
    | FunctionType 
    | TableType 
    | ArrayType
    | GenericType;

export enum TypeClass {
    Primitive = "primitive",
    Reference = "reference",
    Function = "function",
    Table = "table",
    Array = "array",
    Generic = "generic"
}

export class TypeRef {
    typeClass = TypeClass.Reference;
    id: number;

    constructor(id: number) {
        this.id = id;
    }

    follow(): Type {
        return Types.variables[this.id];
    }

    toString() {
        return "$" + this.id;
    }
}

export class TableType {
    typeClass = TypeClass.Table;
    id: number;

    constructor(id: number) {
        this.id = id;
    }

    follow(): Table {
        return Tables.all[this.id];
    }

    toString() {
        return "table#" + this.id;
    }
}

export class FunctionType {
    typeClass = TypeClass.Function;
    params: Type[] = [ ];
    returnType: Type = PrimitiveType.Nil;

    toString(): string {
        return "(" + this.params.map(x => Types.resolve(x)).join(", ") + ") => " + Types.resolve(this.returnType);
    }
}

export class ArrayType {
    typeClass = TypeClass.Array;
    innerType: Type;

    toString(): string {
        return "[" + Types.resolve(this.innerType) + "]";
    }
}

export class GenericType {
    typeClass = TypeClass.Generic;
    name: string;
    depth: number;

    getBinding() {
        return Types.genericBindings[this.name];
    }

    toString() {
        return "$" + this.name;
    }
}

export enum PrimitiveType {
    Nil = "nil",
    Number = "number",
    String = "string",
    Bool = "bool",
    Unknown = "unknown",
    Any = "any"
};

export class Table {
    fields: { [name: string]: Type } = { };

    get(name: string) {
        const gotten = this.fields[name];
        if(!gotten)
            throw "Table does not contain member: " + name;
        return gotten;
    }
}

export class Tables {
    private static idCount = 0;
    static all: { [id: number]: Table } = { };

    static new() {
        const id = this.idCount;
        this.idCount++;
        this.all[id] = new Table();
        return new TableType(id);
    }
}

export class Types {
    private static idCount = 0;

    static variables: { [id: number]: Type } = { };

    static generics: GenericType[] = [ ];
    static genericBindings: { [name: string]: Type } = { };
    static genericReplacement: boolean = false;

    static var(): TypeRef {
        let id = this.idCount;
        this.variables[id] = PrimitiveType.Unknown;
        this.idCount++;
        return new TypeRef(id);
    }

    static resolve(t: Type, stack: Type[] = [ ]): Type {
        if(t === undefined) throw "Tried to resolve undefined type";

        if(stack.find(x => x == t)) return PrimitiveType.Unknown;

        if (this.isPrimitive(t)) 
            return t;
        else {
            const at = t as { typeClass: TypeClass };
            if(at.typeClass == TypeClass.Reference)
                return this.resolve((t as TypeRef).follow(), stack.concat(t));
            // else if(at instanceof FunctionType) {
            //     const resolved = new FunctionType();
            //     resolved.returnType = this.resolve(at.returnType, stack.concat(t));
            //     resolved.params = at.params.map(x => this.resolve(x, stack.concat(t)));
            //     return resolved;
            // }
            // else if(at instanceof ArrayType) {
            //     const resolved = new ArrayType();
            //     resolved.innerType = this.resolve(at.innerType, stack.concat(t));
            //     return resolved;
            // }
            // else if(at.typeClass == TypeClass.Generic) {
            //     if((at as GenericType).getBinding()) {
            //         return this.resolve((at as GenericType).getBinding(), stack.concat(t));
            //     }
            //     else return t;
            // }
            else
                return t;
        }
    }

    static applyGenerics(t: Type) {
        if(this.isPrimitive(t)) return t;

        if(t instanceof TypeRef) {
            console.log("!!!!!!!!!!");
            const applied = Types.var();
            this.setTypeRef(applied, this.applyGenerics(t.follow()));
            return applied;
        }
        else if(t instanceof FunctionType) {
            const applied = new FunctionType();
            applied.returnType = this.applyGenerics(t.returnType);
            applied.params = t.params.map(x => this.applyGenerics(x));
            return applied;
        }
        else if(t instanceof ArrayType) {
            const applied = new ArrayType();
            applied.innerType = this.applyGenerics(t.innerType);
            return applied;
        }
        else if(t instanceof GenericType) {
            if(t.getBinding()) return t.getBinding();
            else return t;
        }
        else throw "Cannot apply generics for " + t;

    }

    static isPrimitive(t: Type) {
        return typeof t === "string";
    }

    static strictlyEqual(l: Type, r: Type) {
        l = Types.resolve(l);
        r = Types.resolve(r);
        if(l instanceof TableType && r instanceof TableType) {
            const lFields = l.follow().fields;
            const rFields = r.follow().fields;

            if(Object.keys(lFields).length != Object.keys(rFields).length)
                return false;

            return Object.keys(lFields).every(x => this.typecheck(lFields[x], rFields[x]));
        }
        else if(l instanceof FunctionType && r instanceof FunctionType) {

            if(l.params.length != r.params.length)
                return false;

            if(!this.typecheck(l.returnType, r.returnType))
                return false;

            return l.params.every((v, i) => this.typecheck((l as FunctionType).params[i], (r as FunctionType).params[i]));
        }
        else if(l instanceof GenericType && r instanceof GenericType) {
            return l.name == r.name;
        }
        // else if()
        else return l == r;
    }

    static isTypeClass(t: Type, c: TypeClass) {
        return (t as { typeClass: TypeClass}).typeClass == c;
    }

    // static applyGeneric(t: Type, toApply: Type) {
    //     if(this.isPrimitive(toApply))
    //     if(g instanceof GenericType) return t;
    // }

    static typecheck(l: Type, r: Type) {
        const left = Types.resolve(l);
        const right = Types.resolve(r);

        if(this.genericReplacement && (left instanceof GenericType || right instanceof GenericType))
            return true;

        return left == PrimitiveType.Unknown || right == PrimitiveType.Unknown 
            || left == PrimitiveType.Any || right == PrimitiveType.Any 
            || Types.strictlyEqual(left, right);
    }

    static assertTypes(l: Type, r: Type) {
        if(!this.typecheck(l, r))
            throw "Expected " + Types.resolve(r) + " but got " + Types.resolve(l);

        if(this.genericReplacement && r instanceof GenericType) {
            if(r.getBinding()) {
                throw "Expected " + Types.resolve(r) + " but got " + Types.resolve(l);
            }
            else {
                this.bindGeneric(r.name, l);
            }
        }
    }

    static bindGeneric(name: string, t: Type) {
        // if(t) console.log("Bound " + name + " to " + t);
        // else console.log("Unbound " + name);
        this.genericBindings[name] = t;
    }

    

    // static coerce(l: Type, r: Type) {
    //     if(!this.isDefinite(l))
    //         this.setTypeRef(l as TypeRef, r);
    //     else Types.assertTypes(l, r);
    // }

    static isDefinite(t: Type) {
        return t != PrimitiveType.Unknown && (t as unknown as TypeRef).typeClass != TypeClass.Reference;
    }

    static setTypeRef(typeRef: TypeRef, newType: Type) {
        if(typeRef.id === undefined) throw "Not a TypeRef";
        Types.variables[typeRef.id] = newType;
    }

    static twoWayCoerce(left: Type, right: Type) {

        if(this.isComplete(left) && this.isComplete(right)) {
            Types.assertTypes(right, left);
        }
        else if(this.isComplete(left)) {
            Types.coerce(right, left);
        }
        else if(this.isComplete(right)) {
            Types.coerce(left, right);
        }
        else {
            Types.coerce(left, right);
            Types.coerce(right, left);
        }
    }

    static coerce(r: Type, t: Type) {
        if(this.isPrimitive(r)) {
            this.assertTypes(r, t);
            return;
        }

        if(r instanceof TypeRef) {
            Types.variables[r.id] = t;
            return;
        }

        this.assertTypes(r, t);
        // if((r as { typeClass: TypeClass }).typeClass != (t as { typeClass: TypeClass }).typeClass) {
            // this.assertTypes(r, t);
            // return;
            // throw "expected " + r " but " + t
        // }

        switch((r as { typeClass: TypeClass }).typeClass) {
            case TypeClass.Array: {
                this.coerce((r as ArrayType).innerType, (t as ArrayType).innerType);
                break;
            }
            case TypeClass.Function: {
                this.coerce((r as FunctionType).returnType, (t as FunctionType).returnType);
                for (let i = 0; i < (r as FunctionType).params.length; i++) {
                    this.coerce((r as FunctionType).params[i], (t as FunctionType).params[i])
                }
                break;
            }
            case TypeClass.Table: {
                const tableFields = (r as TableType).follow().fields;
                Object.keys(tableFields).forEach(x => this.coerce(tableFields[x], t));
                break;
            }
            case TypeClass.Generic: {
                return;
            }
            default: {
                throw "Cannot coerce type: " + JSON.stringify(t, null, 2);
            }
        }
    }

    static isComplete(t: Type): boolean {
        t = Types.resolve(t);

        if(this.isPrimitive(t)) {
            return t != PrimitiveType.Unknown;
        }
       
        switch((t as { typeClass: TypeClass }).typeClass) {
            case TypeClass.Array: {
                return this.isComplete((t as ArrayType).innerType);
            }
            case TypeClass.Function: {
                return this.isComplete((t as FunctionType).returnType)
                    && (t as FunctionType).params.every(x => this.isComplete(x));
            }
            case TypeClass.Reference: {
                return false;
            }
            case TypeClass.Table: {
                const tableFields = (t as TableType).follow().fields;
                return Object.keys(tableFields).every(x => this.isComplete(tableFields[x]))
            }
            case TypeClass.Generic: {
                return true;
            }
            default: {
                throw "Cannot determine completeness of type: " + JSON.stringify(t, null, 2);
            }
        }

        return false;
    }

    static sameGeneric(a: Type, b: Type) {
        const ar = Types.resolve(a);
        const br = Types.resolve(b);
        return ar instanceof GenericType && br instanceof GenericType && ar.name == br.name;
    }

    static getGeneric(name: string): GenericType {
        return this.generics.find(x => x.name == name);
    }

    static getExplicitType(t: Type, allowNewGenerics: boolean = false) {
        if(t == undefined) return undefined;

        if(this.isPrimitive(t))
            return t;

        switch((t as { typeClass: TypeClass }).typeClass) {
            case TypeClass.Array: {
                const x = new ArrayType();
                x.innerType = this.getExplicitType((t as ArrayType).innerType);
                return x;
            }
            case TypeClass.Function: {
                const x = new FunctionType();
                x.params = (t as FunctionType).params.map(x => this.getExplicitType(x));
                x.returnType = this.getExplicitType((t as FunctionType).returnType);
                return x;
            }
            case TypeClass.Generic: {
                const name = (t as GenericType).name;
                if(allowNewGenerics) {
                    let found = this.getGeneric(name);
                    if(!found)
                    {
                        found = new GenericType();
                        found.name = name;
                        found.depth = Variables.depth;
                        this.generics.push(found);
                    }
                    return found;
                }
                else {
                    const found = this.getGeneric(name);
                    if(!found)
                        throw "Generic type does not exist: $" + name;
                    return found;
                }
            }
            default: {
                throw "Cannot parse explicit type: " + JSON.stringify(t, null, 2);
            }
        }
    }
}

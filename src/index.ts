const peg = require("pegjs");
const fs = require("fs");

import { TableType, TypeClass, Table, Tables, Type, PrimitiveType, Types, TypeRef, FunctionType, ArrayType, GenericType } from "./types";
import { Variable, Variables } from "./variables";

type Ast = AstBinOp 
    | AstUnaryOp 
    | AstFactor 
    | AstProgram 
    | AstVarDec 
    | AstAssignment 
    | AstVariable 
    | AstFunction
    | AstTable
    | AstTraverse
    | AstCall
    | AstArray
    | AstIndex
    | AstTypeOf
    | AstAs

interface AstVarDec {
    op: string;
    name: string;
    value: Ast;
    type: Type;
}

interface AstUnaryOp {
    op: string;
    unary: Ast;
}

interface AstBinOp {
    op: string;
    left: Ast;
    right: Ast;
}

interface AstFactor {
    op: string;
    content: string;
    type: Type;
}

interface AstProgram {
    op: string;
    statements: Ast[];
}

interface AstAssignment {
    op: string;
    left: Ast;
    right: Ast;
}

interface AstVariable {
    op: string;
    name: string;
}

interface AstFunction {
    op: string;
    params: { name: string; type: Type; }[];
    returnType: Type;
    body: Ast;
}

interface AstTable {
    op: string;
    fields: { name: string; value: Ast }[];
}

interface AstTraverse {
    op: string;
    table: Ast;
    name: string;
}

interface AstCall {
    op: string;
    table: Ast;
    params: Ast[];
}

interface AstArray {
    op: string;
    items: Ast[];
}

interface AstIndex {
    op: string;
    index: Ast;
    table: Ast;
}

interface AstTypeOf {
    op: string;
    type: Type;
}

interface AstAs {
    op: string;
    value: Ast;
    type: Type;
}

interface Value {
    content: string;
    type: Type;
}

const grammarFile = fs.readFileSync("src/grammar.pegjs", "utf-8");
const parser = peg.generate(grammarFile);

const evaluators: { [op: string]: (ast: Ast) => Value  } = { };

let assigning = false;

const expectPrimitive = (a: Ast, type: PrimitiveType): Value => {
    const res = evaluate(a);
    Types.coerce(res.type, type);
    return res;
};

const createBinOp = (inType: Type, f: (left: Value, right: Value) => Value): (ast: AstBinOp) => Value => {
    return ast => {
        const left = expectPrimitive(ast.left, PrimitiveType.Number);
        const right = expectPrimitive(ast.right, PrimitiveType.Number);
        return f(left, right);
    };
};

evaluators.plus = createBinOp(PrimitiveType.Number, (left, right) => ({
    content: "(" + left.content + "+" + right.content + ")",
    type: PrimitiveType.Number
}));

evaluators.minus = createBinOp(PrimitiveType.Number, (left, right) => ({
    content: "(" + left.content + "-" + right.content + ")",
    type: PrimitiveType.Number
}));

evaluators.times = createBinOp(PrimitiveType.Number, (left, right) => ({
    content: "(" + left.content + "*" + right.content + ")",
    type: PrimitiveType.Number
}));

evaluators.over = createBinOp(PrimitiveType.Number, (left, right) => ({
    content: "(" + left.content + "/" + right.content + ")",
    type: PrimitiveType.Number
}));

evaluators.concat = createBinOp(PrimitiveType.Any, (left, right) => ({
    content: "(tostring(" + left.content + ")..tostring(" + right.content + "))",
    type: PrimitiveType.String
}));

evaluators.factor = (ast: AstFactor): Value => ({
    content: ast.content,
    type: ast.type
});

evaluators.brackets = (ast: AstUnaryOp): Value => evaluate(ast.unary);

const line = (content: string): Value => {
    return {
        content: content,
        type: PrimitiveType.Nil
    }
};

evaluators.vardec = (ast: AstVarDec): Value => {
    let value: Value;

    const explicitType = Types.getExplicitType(ast.type);
    if(ast.value) {
        value = evaluate(ast.value);
        if(explicitType) {
            Types.coerce(value.type, explicitType);
        }
    }

    // if(explicitType instanceof GenericType) {

    // }

    Variables.all.push(new Variable(ast.name, explicitType || (value? Types.resolve(value.type) : Types.var()), Variables.depth));

    return line("local " + ast.name + (value? (" = " + value.content) : ""));
};

evaluators.variable = (ast: AstVariable): Value => ({
    content: ast.name,
    type: Variables.get(ast.name).type
});

evaluators.typeof = (ast: AstTypeOf): Value => ({
    content: "nil",
    type: Types.getExplicitType(ast.type)
});

evaluators.as = (ast: AstAs): Value => ({
    content: evaluate(ast.value).content,
    type: Types.getExplicitType(ast.type)
});

evaluators.function = (ast: AstFunction): Value => {
    Variables.push();

    const paramVars: Variable[] = [ ];

    // populate scope with parameters
    for (let i = 0; i < ast.params.length; i++) {
        const param = ast.params[i];
        const paramVar = new Variable(param.name, Types.getExplicitType(param.type, true) || Types.var(), Variables.depth);
        paramVars.push(paramVar);
        Variables.all.push(paramVar);
    }

    const type = new FunctionType();
    type.returnType = Types.getExplicitType(ast.returnType, true);

    for (const param of paramVars) {
        type.params.push(param.type);
    }

    const body = evaluate(ast.body);

    Variables.pop();

    if(type.returnType)
        Types.coerce(body.type, type.returnType)
    else {
        type.returnType = body.type;
    }

    return {
        content: "(function(" + ast.params.map(x => x.name) + ") return " + body.content + " end)",
        type: type
    };
};

evaluators.call = (ast: AstCall): Value => {
    const func = evaluate(ast.table);
    const resolvedType = Types.resolve(func.type);
    if(!Types.isTypeClass(resolvedType, TypeClass.Function)) {
        throw "Attempted to call a " + resolvedType + " instead of a function";
    }

    const funcType = resolvedType as FunctionType;

    if(ast.params.length != funcType.params.length)
        throw "Expected " + funcType.params.length + " arguments but got " + ast.params.length;

    const params: Value[] = [ ];
    for (let i = 0; i < funcType.params.length; i++) {
        const type = funcType.params[i];

        const param = evaluate(ast.params[i]);
        params.push(param);

        Types.genericReplacement = true;
        Types.twoWayCoerce(type, param.type);
        Types.genericReplacement = false;

    }

    // let returnType = (func.type as FunctionType).returnType;
    let returnType = Types.applyGenerics(funcType.returnType);

    funcType.params.forEach(x => {
        if(x instanceof GenericType)
            Types.bindGeneric(x.name, null);
    });

    return {
        content: "(" + func.content + ")(" + params.map(x => x.content).join(", ") + ")",
        type: returnType
    };
};

evaluators.traverse = (ast: AstTraverse): Value => {
    const table = evaluate(ast.table);
    const resolvedType = Types.resolve(table.type);
    if(!Types.isTypeClass(resolvedType, TypeClass.Table)) {
        throw "Attempted to traverse a " + resolvedType + " instead of a table";
    }

    const fieldType = (resolvedType as TableType).follow().get(ast.name);
    return {
        content: table.content + "." + ast.name,
        type: fieldType
    };
};

evaluators.index = (ast: AstIndex): Value => {
    const table = evaluate(ast.table);
    const resolvedType = Types.resolve(table.type);
    if(!Types.isTypeClass(resolvedType, TypeClass.Array)) {
        throw "Attempted to index a " + resolvedType + " instead of an array";
    }

    const index = evaluate(ast.index);

    return {
        content: table.content + "[" + index.content + "]",
        type: (resolvedType as ArrayType).innerType
    };
}

evaluators.table = (ast: AstTable): Value => {
    const table = Tables.new();

    let tableFieldContent: string[] = [ ];

    for (const field of ast.fields) {
        const res = evaluate(field.value);
        table.follow().fields[field.name] = Types.isDefinite(res.type)? res.type : Types.var();
        tableFieldContent.push(field.name + " = " + res.content);
    }

    return {
        content: "{ " + tableFieldContent.join(", ") + " }",
        type: table
    };
};

evaluators.array = (ast: AstArray): Value => {
    const type = new ArrayType();
    const arrayItemContents: string[] = [ ];

    if(ast.items.length < 1) {
        type.innerType = Types.var();
    }
    else {
        for (const item of ast.items) {
            const val = evaluate(item);

            if(!type.innerType) {
                if(Types.isDefinite(val.type))
                    type.innerType = val.type;
            }
            else 
                // try { 
                    Types.coerce(val.type, type.innerType);
                // } 
                // catch {
                //     type.innerType = PrimitiveType.Any;
                // }

            arrayItemContents.push(val.content);
        }
    }

    return {
        content: "{ " + arrayItemContents.join(", ") + " }",
        type: type
    };
};

evaluators.assignment = (ast: AstAssignment): Value => {
    // assigning = true;

    const left = evaluate(ast.left);

    // assigning = false;

    const right = evaluate(ast.right);

    Types.twoWayCoerce(left.type, right.type);

    return line(left.content + " = " + right.content);
};


evaluators.program = (ast: AstProgram): Value => {
    let result = "";

    for(const statement of ast.statements) {
        result += evaluate(statement).content + "\n";
    }

    return line(result);
};

const evaluate = (ast: Ast): Value => {
    if(ast === undefined)
        throw "Tried to evaluate undefined";
    const evalFunc = evaluators[ast.op];
    if(!evalFunc)
        throw "No evaluator function found for: " + ast.op;
    return evaluators[ast.op](ast);
};

const str = (ast: Ast): string => evaluate(ast).content;

// const source = `
// let a 
// let b = () => a
// a = 4
// let c = b()
// `;

// const source = `
// let identity = (a: $T) => a
// let a = identity(3)
// `;

const source: string = fs.readFileSync("src.tna", "utf-8");

let ast;
try {
    ast = parser.parse(source);
}
catch  (err) {
    if (!err.hasOwnProperty('location')) throw(err);

    let lines = source.split("\n");

    let expected = err.expected.map(x => "\"" + x.text + "\"");
    expected = expected.filter((item, pos) => expected.indexOf(item) == pos);
    let text = "SYNTAX ERROR @ Ln " + err.location.start.line + ", col " + err.location.start.column + "\n";
    text += "Unexpected \"" + err.found + "\" -- expected one of " + expected.join(", ") + ".\n";
    console.log(err);
    text += "     | \n";
    text += err.location.start.line.toString().padStart(4) + " | " + lines[err.location.start.line - 1] + "\n";
    text += "     | ";
    for (let i = 0; i < err.location.start.column - 1; i++) {
        text += " ";
    }
    text += "^";
    console.log(text);

    process.exit(1);
}

const pp = x => console.log(ps(x));
const ps = x => JSON.stringify(x, null, 2);
// pp(ast);
const out = evaluate(ast);
console.log("SOURCE:\n" + source);
console.log("COMPILED:\n" + out.content.trim());
// for (let i = 0; i < Object.keys(Types.variables).length; i++) {
//     const v = Types.variables[i];
//     if(v)
//         console.log("$" + i + ": " + Types.resolve(v));
// }
console.log("TYPES:");
for (let i = 0; i < Object.keys(Tables.all).length; i++) {
    const v = Tables.all[i];
    const tableKeys = Object.keys(Tables.all[i].fields);
    if(v)
    console.log("table#" + i + ": {\n" + tableKeys.map(x => "  " + x + ": " + Types.resolve(v.fields[x])).join("\n") + "\n}");
}

for (const v of Variables.all) {
    console.log(v.name + ": " + Types.resolve(v.type));
}

fs.writeFileSync("out.lua", out.content);

// pp(Types.variables);
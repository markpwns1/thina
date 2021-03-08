program = stmts:stmt+ {
    return {
        op: "program",
        statements: stmts
    };
}

stmt
    = _ s:(vardec / assignment) _ {
        return s;
    }

assignment
    = left:(snakery / variable) _ "=" _ right:expr {
        return {
            op: "assignment",
            left: left,
            right: right
        };
    }

vardec
    = "let" _ name:identifier t:(_ ":" _ type)? val:(_ "=" _ expr)? {
        return {
            op: "vardec",
            name: name,
            value: val? val[3] : undefined,
            type: t? t[3] : undefined,
            // mut: Boolean(mut)
        };
    }

expr
    = _ inner:additive _ {
        return inner;
    }

_  "whitespace" = [ \t\r\n]*

additive
    = left:multiplicative _ op:("+" / "-") _ right:additive { 
        return {
            op: op == "+"? "plus" : "minus",
            left: left,
            right: right
        }; 
      }
    / multiplicative

multiplicative
    = left:(snakery / as) _ op:("*" / "/" / "..") _ right:multiplicative { 
        return {
            op: { "*": "times", "/": "over", "..": "concat" }[op],
            left: left,
            right: right
        }; 
    }
    / snakery / as

index
    = _ "[" _ index:expr _ "]" {
        return {
            op: "index",
            index: index
        };
    }

traverse 
    = _ "." _ name:identifier {
        return {
            op: "traverse",
            name: name
        };
    }

call
    = _ "(" _ head:(expr _)? tail:("," _ expr _)* ")" {
        if(!head && tail.length > 0)
            error("Invalid parameter syntax");

        return {
            op: "call",
            params: [ ...(head? [ head[0] ] : [ ]), ...(tail? tail.map(x => x[2]) : [ ]) ]
        };
    }

snakery
    = head:(as) tail:(traverse / call / index)+ {
        let next = head;

        for (const item of tail) {
            item.table = next;
            next = item;
        }

        return next;
    }

as "as"
    = val:primary _ "as" _ t:type {
        return {
            op: "as",
            value: val,
            type: t
        };
    } / primary

primary
    = factor
    / "(" _ additive:expr _ ")" { 
        return {
            op: "brackets",
            unary: additive
        };
    }

factor "factor" = i:(typeof / function / nil / array / table / integer / bool / string / variable) { 
        return {
            op: "factor",
            ...i
        };
    }  

typeof
    = "<" t:type ">" {
        return {
            op: "typeof",
            type: t
        };
    }

// any 
//     = "?" {
//         return {
//             content: "nil",
//             type: "unknown"
//         };
//     }

identifier "identifier"
    = head:[_0-9a-zA-Z] tail:[_a-zA-Z]* {
        return head + tail.join("");
    }

integer "integer"
    = digits:[0-9]+ { 
        return {
            content: parseInt(digits.join(""), 10),
            type: "number"
        };
    }

variable "variable"
    = name:identifier {
        return {
            op: "variable",
            name: name
        };
    }

table "table"
    = "{" _ fields:(identifier _ "=" _ expr)* _ "}" {
        return {
            op: "table",
            fields: fields.map(x => ({
                name: x[0],
                value: x[4]
            }))
        };
    }

array "array"
    = "[" _ head:(expr _)? tail:("," _ expr _)* "]" {
        if(!head && tail.length > 0)
            error("Invalid array syntax");

        return {
            op: "array",
            items: [ ...(head? [ head[0] ] : [ ]), ...(tail? tail.map(x => x[2]) : [ ]) ]
        };
    }

string "string"
    = '"' chars:double_string_char* '"' { 
        return {
            content: "\"" + chars.join('') + "\"",
            type: "string"
        }
    }

bool "boolean"
    = b:("true" / "false") {
        return {
            content: b,
            type: "bool"
        };
    }

nil "nil"
    = "nil" {
        return {
            content: "nil",
            type: "nil"
        };
    }

double_string_char
    = !('"' / "\\") char:. { return char; }
    / "\\" sequence:escape_sequence { return sequence; }

func_arg "function argument"
    = name:identifier _ t:(":" _ type _)? {
        return {
            name: name,
            type: t? t[2] : undefined
        };
    }

generic_list
    = head:type tail:(_ "," _ type)* {
        return [ ...(head? [ head ] : [ ]), ...(tail? tail.map(x => x[2]) : [ ]) ];
    }

function "function"
    = /*generics:("<" _ generic_list _ ">")?*/ "(" _ head:func_arg? tail:("," _ func_arg)* ")" returnType:(_ ":" _ type)? _ "=>" _ body:expr {
        if(!head && tail.length > 0)
            error("Invalid parameter syntax");

        return {
            op: "function",
            params: [ ...(head? [ head ] : [ ]), ...(tail? tail.map(x => x[2]) : [ ]) ],
            returnType: returnType? returnType[3] : undefined,
            // generic:
            body: body
        };
    }

escape_sequence
    = '"'
    / "\\"
    / "b"  { return "\b";   }
    / "f"  { return "\f";   }
    / "n"  { return "\n";   }
    / "r"  { return "\r";   }
    / "t"  { return "\t";   }
    / "v"  { return "\x0B"; }


primitive "primitive type"
    = "number" / "string" / "bool" / "any" / "nil"

function_type "function type"
    = "(" _ head:(type _ )? tail:("," _ type _)* ")" _ "=>" _ returnType:type {
        if(!head && tail.length > 0)
            error("Invalid function type syntax");

        return {
            typeClass: "function",
            params: [ ...(head? [ head[0] ] : [ ]), ...(tail? tail.map(x => x[2]) : [ ]) ],
            returnType: returnType
        };
    }

array_type "array type"
    = "[" innerType:type "]" {
        return {
            typeClass: "array",
            innerType: innerType
        };
    }

generic_type "generic type"
    = "$" name:identifier {
        return {
            typeClass: "generic",
            name: name
        }
    }

type "type"
    = primitive / function_type / array_type / generic_type
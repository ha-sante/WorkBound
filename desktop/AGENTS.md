# Code formatting requirements:
File Naming:
1. Use lowercase filenames for source files.
2. Use snake_case for multiword filenames.
3. Match import paths to filename casing exactly; Linux filesystems are case-sensitive.

Function Declarations:
1. Always for all functions - use snakecase for the function names.
2. Do not create multiline function name declarations 
   1. instead if a function name section declaration is multiline - move types out and keep params short.

Type Declarations:
1. Do not include types inline if they are > 2. Instead put this into a type file inline.
2. If a file has > 2 type declarations, move all types in that file to the top section.
3. Any type used in 1 plus files should be moved into the global.d.ts

Constants and their reuse:
1. rpc messages strings are stored constants
2. we use them to standardize messaging strings across mainview and bun side.

Variable Declarations:
1. Always for all variables - use snakecase for the function names.
2. If variable is in a type declaration - use snakecase format for the function name.

Number of lines for a function:
1.if a function is one line innner - and it was created for reusue and typing relations.
   - make it just const function_name = () => one line code...;


# Code development framework:
This is an Electrobun desktop application.
IMPORTANT: Electrobun is NOT Electron. Do not use Electron APIs or patterns.

## Documentation
Full API reference: https://blackboard.sh/electrobun/llms.txt
Getting started: https://blackboard.sh/electrobun/docs/

## Quick Reference
Import patterns:
- Main process (Bun): `import { BrowserWindow } from "electrobun/bun"`
- Browser context: `import { Electroview } from "electrobun/view"`
Use `views://` URLs to load bundled assets (e.g., `url: "views://mainview/index.html"`).
Views must be configured in `electrobun.config.ts` to be built and copied into the bundle.

## About
Electrobun is built by Blackboard (https://blackboard.sh), an innovation lab building
tools and funding teams that define the next generation of technology.

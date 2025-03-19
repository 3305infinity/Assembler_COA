// Defining all the operation codes for our CPU
// Format is opcode: binary representation (5 bits)
const OPCODES = {
    "ADD": "00000", "SUB": "00001", "MUL": "00010", "DIV": "00011",
    "MOD": "00100", "CMP": "00101", "AND": "00110", "OR": "00111",
    "NOT": "01000", "MOV": "01001", "MOVU": "01001", "MOVH": "01001",
    "LSL": "01010", "LSR": "01011", "ASR": "01100", "NOP": "01101",
    "LD": "01110", "ST": "01111", "BEQ": "10000", "BGT": "10001",
    "B": "10010", "CALL": "10011", "RET": "10100", "END": "11111",
    "HLT": "11111"
};

// Define our registers and their 4-bit codes
const REGISTERS = {
    "R0": "0000", "R1": "0001", "R2": "0010", "R3": "0011",
    "R4": "0100", "R5": "0101", "R6": "0110", "R7": "0111",
    "R8": "1000", "R9": "1001", "R10": "1010", "R11": "1011",
    "R12": "1100", "R13": "1101", "R14": "1110", "R15": "1111"
};

// This will store our labels and their memory addresses
let symbol_table = {};
// This tracks the last compare operation for branch instructions
let last_cmp = null;

// First pass: calculate addresses for all labels
function pc_address(lines) {
    let pc = 0; // Program Counter - tracks current memory address

    lines.forEach(line => {
        // Remove comments (anything after #) and trim whitespace
        let stripped = line.split("#")[0].trim();
        if (!stripped) return; // Skip empty lines

        if (stripped.includes(":")) {
            // This line has a label
            let [label, rest] = stripped.split(":", 2);
            label = label.trim();

            // Store label address (aligned to 4 bytes by clearing bottom 2 bits)
            symbol_table[label] = pc & ~0b11;
            console.log(`Recorded label: ${label} at address ${pc}`);

            // Only increase PC if there's an actual instruction after the label
            if (rest && rest.trim()) {
                pc += 4;
            }
        } else {
            // Normal instruction - each takes 4 bytes
            pc += 4;
        }
    });
}

// Helper to format instruction in binary
// Takes all the parts and puts them in the right bit positions
function format_binary(opcode, i, rd, rs1, rs2, imm) {
    if (imm !== null) {
        // This is an immediate-type instruction (has a constant value)
        let imm_bin = (imm & 0x3FFFF).toString(2).padStart(18, '0');
        return `${opcode}${i}${rd}${rs1}${imm_bin}`;
    } else {
        // This is a register-type instruction (uses registers only)
        return `${opcode}${i}${rd}${rs1}${rs2}${'0'.repeat(14)}`;
    }
}

// This is the heart of the assembler - converts one line to machine code
function assemble_instruction(line, pc) {
    // Split instruction into parts and clean it up
    let parts = line.replace(/,/g, '').trim().split(/\s+/);
    if (parts.length === 0) return null;  // Empty line

    // If line starts with a label, remove it
    if (parts[0].endsWith(":")) {
        parts.shift();  // Remove the label
        if (parts.length === 0) return null;  // Only had a label, no instruction
    }

    // Get the instruction type (ADD, MOV, etc)
    let inst = parts[0];
    if (!(inst in OPCODES)) {
        throw new Error(`Unknown instruction: ${inst}`);
    }

    let opcode = OPCODES[inst];

    // Handle different instruction types
    switch (inst) {
        // Arithmetic and logic operations that can use registers or immediates
        case "ADD": case "SUB": case "MUL": case "DIV": case "LSL": case "LSR":
        case "ASR": case "AND": case "OR": case "MOD": case "LD": case "ST":
            // Check if using immediate value (ADD R1, R2, 42)
            if (parts.length === 4 && !isNaN(parts[3])) {
                let rd = REGISTERS[parts[1].toUpperCase()], rs1 = REGISTERS[parts[2].toUpperCase()];
                let imm = parseInt(parts[3].toUpperCase()) & 0x3FFFF; // 18-bit immediate value
                return format_binary(opcode, "1", rd, rs1, "0000", imm);
            }
            // Check if using registers only (ADD R1, R2, R3)
            else if (parts.length === 4) {
                let rd = REGISTERS[parts[1].toUpperCase()], rs1 = REGISTERS[parts[2].toUpperCase()], rs2 = REGISTERS[parts[3].toUpperCase()];
                return format_binary(opcode, "0", rd, rs1, rs2, null);
            }
            break;

        // Compare instruction - important for branch operations
        case "CMP":
            // Compare register with immediate (CMP R1, 42)
            if (parts.length === 3 && !isNaN(parts[2])) {
                let rs1 = REGISTERS[parts[1].toUpperCase()];
                let imm = parseInt(parts[2].toUpperCase()) & 0x3FFFF;
                last_cmp = [rs1, imm]; // Remember what we compared for branch instructions
                return format_binary(opcode, "1", "0000", rs1, "0000", imm);
            }
            // Compare two registers (CMP R1, R2)
            else if (parts.length === 3) {
                let rs1 = REGISTERS[parts[1].toUpperCase()], rs2 = REGISTERS[parts[2].toUpperCase()];
                last_cmp = [rs1, rs2]; // Remember what we compared
                return format_binary(opcode, "0", "0000", rs1, rs2, null);
            }
            break;

        // Single operand instructions    
        case "NOT": case "MOV":
            // Move immediate to register (MOV R1, 42)
            if (parts.length === 3 && !isNaN(parts[2])) {
                let rd = REGISTERS[parts[1].toUpperCase()];
                let imm = parseInt(parts[2].toUpperCase()) & 0x3FFFF;
                return format_binary(opcode, "1", rd, "0000", "0000", imm);
            }
            // Move register to register (MOV R1, R2)
            else if (parts.length === 3) {
                let rd = REGISTERS[parts[1].toUpperCase()], rs1 = REGISTERS[parts[2].toUpperCase()];
                return format_binary(opcode, "0", rd, "0000", rs1, null);
            }
            break;

        // Special move instructions for handling larger values
        case "MOVU": case "MOVH":
            if (parts.length === 3) {
                let rd = REGISTERS[parts[1].toUpperCase()];
                let imm_str = parts[2].trim();
                let imm;

                // Handle both hex (0x123) and decimal numbers
                if (imm_str.startsWith("0x") || imm_str.startsWith("0X")) {
                    imm = parseInt(imm_str, 16);
                } else {
                    imm = parseInt(imm_str, 10);
                }

                if (inst === "MOVU") {
                    // MOVU: Move to Upper bits (low 16 bits)
                    imm &= 0xFFFF; // Keep only 16 bits
                    return format_binary(opcode, "1", rd, "0000", "0000", imm);
                } else {
                    // MOVH: Move to High bits (high 16 bits)
                    imm = (imm << 16) & 0x3FFFF; // Shift left and mask
                    return format_binary(opcode, "1", rd, "0000", "0000", imm);
                }
            }
            break;

        case "BEQ": case "BGT":
            // Branch instructions must have exactly one argument (a label)
            if (parts.length !== 2) {
                throw new Error(`Invalid syntax for ${inst}: ${line}`);
            }

            // Ensure a CMP instruction was executed before a conditional branch
            if (last_cmp === null) {
                alert(`Error: ${inst} must follow a CMP instruction.`);
                throw new Error(`${inst} must follow a CMP instruction.`);
            }

            let label = parts[1];
            if (!(label in symbol_table)) {
                alert(`Error: Undefined label '${label}' at line ${pc / 4 + 1}`);
                throw new Error(`Undefined label '${label}' at line ${pc / 4 + 1}`);
            }

            let target = symbol_table[label];

            // Calculate the relative offset (target address - next instruction address)
            let offset = target - (pc + 4);
            let address = (offset & 0x7FFFFFF).toString(2).padStart(27, '0');

            // Reset last_cmp after using it
            last_cmp = null;

            return `${opcode}${address}`;

        case "B": case "CALL":
            // Branch and Call instructions take a single label argument
            if (parts.length === 2) {
                let target = symbol_table[parts[1]];
                let offset = target - (pc + 4);
                let address = (offset & 0x7FFFFFF).toString(2).padStart(27, '0');
                return `${opcode}${address}`;
            }
            break;

        // Simple instructions with no operands
        case "RET": case "NOP": case "HLT": case "END":
            return `${opcode}000000000000000000000000000`;

        default:
            throw new Error(`Invalid instruction format: ${line}`);
    }
}

// Main function that assembles the code and shows the output
function assembleCode() {
    // Get references to the HTML elements
    let inputElem = document.getElementById('inputCode');
    let binaryElem = document.getElementById('binaryOutput');
    let hexElem = document.getElementById('hexOutput');

    if (!inputElem || !binaryElem || !hexElem) {
        console.error("Error: Missing HTML elements.");
        return;
    }

    // Get the input code and split into lines
    let input = inputElem.value;
    let lines = input.split('\n');

    // First pass: gather all the label addresses
    pc_address(lines);

    // Second pass: convert each instruction to binary
    let binaryOutput = "";
    let hexOutput = "";
    pc = 0; // Reset program counter

    lines.forEach((line, index) => {
        try {
            // Try to assemble each line
            let binary = assemble_instruction(line.trim(), pc);
            if (binary) {
                // If successful, add to output
                binaryOutput += binary + '\n';
                // Also convert to hex for more readable output
                hexOutput += parseInt(binary, 2).toString(16).toUpperCase().padStart(8, '0') + '\n';
                pc += 4; // Move to next instruction
            }
        } catch (e) {
            console.error(`Error at line ${index + 1}: ${e.message}`);
        }
    });

    // Update the output elements
    binaryElem.value = binaryOutput.trim();
    hexElem.value = hexOutput.trim();

    // Setup download links for the binary and hex files
    let binBlob = new Blob([binaryOutput], { type: 'text/plain' });
    let hexBlob = new Blob([hexOutput], { type: 'text/plain' });

    document.getElementById('downloadBin').href = URL.createObjectURL(binBlob);
    document.getElementById('downloadBin').download = "output.bin";

    document.getElementById('downloadHex').href = URL.createObjectURL(hexBlob);
    document.getElementById('downloadHex').download = "output.hex";
}

// Function to clear the input area
function clearInput() {
    document.getElementById('inputCode').value = '';
    document.getElementById('binaryOutput').value = '';
    document.getElementById('hexOutput').value = '';
}

// Function to load a file from the desktop
function loadFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('inputCode').value = e.target.result;
        };
        reader.readAsText(file);
    }
}
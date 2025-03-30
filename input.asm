MOV R1, 10    
    MOV R2, 10    
    CMP R1, R2      
    BEQ equal       
    MOV R3, 0     
equal:
    MOV R3, 1      
    HLT



MOV R3 1
MOV R4 R1
LOOP: MOD R5 R4 R4
CMP R5 0
BEQ LCM
ADD R3 R3 1
MUL R4 R1 R3
LCM: MOV R0 R4
MUL R4 R1 R3
B LOOP

SUB R4,R5,R5
ADD R2 ,R3,R1

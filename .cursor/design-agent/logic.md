im doing a product design for a customisable pillow that requirers configuration. I want to be able to give the right type of configurations based on a few factors:
    - Shoulder length
    - Neck to back length
    - Head to back Length
    - Neck Length
    - Bed firmness

Based on the parameters for each factors, i would then like a mathematical formula that calculates the answers based on each factor's min and max parameters
    - Shoulder length (inch) - increases by 1
        Lowest: 13
        Highest: 23

    - Neck to back length (inch) - increases by 0.5
        Lowest: 1.5
        Highest: 6

    - Head to back Length (inch) - increases by 0.5
        Lowest: -1.5
        Highest: 9

    - Neck Length (inch) - increases by 0.5
        Lowest: 2
        Highest: 5

    - Bed firmness
        Soft
        Medium Firm
        Firm

How do we derive an answer based on the input factors? 
I have different types of fillings I put in the pillow to create the desired height + firmness 
based on the input measurements above. We call them configurations.

I will be giving you a few examples of what these configurations are with the given parameters, 
and I need you to think of a mathematical formula so that I can give any kind of input for the 
factors, and I will get an accurate answer.

The answer format i want to see will be:
    - Pillow Size
    - Side
    - Center

*Side and/or center can contain these different types of fillings (/ is the divider)
6DS / 6DM / 6DL / 6DLong / 6DXL / 6D+L / 6D+S/ 6DFold / 6Dcor / 3DS / 3DRound / 6DRound / ECP(Ear)

Examples:
    001
        - Shoulder length
            - 20
        - Neck to back length
            - 2
        - Head to back Length
            - 1.5
        - Neck Length
            - 3.5
        - Bed firmness
            - Medium Firm
        - Pillow Size
            - L
        - Side
            - 6D+L / 6D+L / 6Dcor / 6D+L 
        - Center
            - 6D+S / 6D+S / 6DM / 6DM / 6DS
    002
        - Shoulder length
            - 16
        - Neck to back length
            - 2
        - Head to back Length
            - 0.5
        - Neck Length
            - 3
        - Bed firmness
            - Firm
        - Pillow Size
            - S
        - Side
            - 6D+L / 3Dcor / 6DS / Fold / 6DS 
        - Center
            - 6DS / 6DS / 6D+S
    003
        - Shoulder length
            - 18
        - Neck to back length
            - 2
        - Head to back Length
            - 1.5
        - Neck Length
            - 3.5
        - Bed firmness
            - Firm
        - Pillow Size
            - L
        - Side
            - 6D+L / 6D+L / 6Dcor / XL / 6DS
        - Center
            - 6DS / 6DS+ / 6DM / 6DS
    004
        - Shoulder length
            - 19
        - Neck to back length
            - 2
        - Head to back Length
            - 1
        - Neck Length
            - 3
        - Bed firmness
            - Medium Firm
        - Pillow Size
            - M
        - Side
            - 6D+L / 6D+L / 6Dcor / 6DS / 6DFold
        - Center
            - 6DS / 3D / 6D / 6D+S
    005
        - Shoulder length
            - 13
        - Neck to back length
            - 2
        - Head to back Length
            - 1
        - Neck Length
            - 3
        - Bed firmness
            - Medium Firm
        - Pillow Size
            - XS
        - Side
            - ECP / 6DM
        - Center
            -  3DS / 3DS / 6DFold / 6DS
    006
        - Shoulder length
            - 17
        - Neck to back length
            - 2
        - Head to back Length
            - 1
        - Neck Length
            - 3
        - Bed firmness
            - Medium Firm
        - Pillow Size
            - M
        - Side
            - 6D+L / 6D+L / 6Dcor / 6DS / 6DFold
        - Center
            - 6DS / 6DS / 6DM / 6D+S
    007
        - Shoulder length
            - 16
        - Neck to back length
            - 3
        - Head to back Length
            - 2.5
        - Neck Length
            - 3
        - Bed firmness
            - Medium Firm
        - Pillow Size
            - S
        - Side
            - 6D+L / 3Dcor / 6DS / 6DS / 6DFold
        - Center
            - 6D+S / 6DM / 6D+S


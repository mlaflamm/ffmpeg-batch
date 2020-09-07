#! /bin/bash

INPUT_FILE=$1
OUTPUT_FILE=$2

echo "$INPUT_FILE"
echo "$OUTPUT_FILE"

ffmpeg -y -i "$INPUT_FILE" -metadata title="" -s 960x540 -crf 21 -c:a copy "$OUTPUT_FILE" 2>&1

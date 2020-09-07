#! /bin/bash

INPUT_FILE=$1
OUTPUT_FILE=$2

echo "$INPUT_FILE"
echo "$OUTPUT_FILE"

ffmpeg -y -i "$INPUT_FILE" -metadata title="" -filter:v scale="960:trunc(ow/a/2)*2" -crf 21 -c:a copy "$OUTPUT_FILE" 2>&1

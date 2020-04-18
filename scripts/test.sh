#! /bin/bash

INPUT_FILE=${1//%/%%}
OUTPUT_FILE=${2//%/%%}

echo "$INPUT_FILE"
echo "$OUTPUT_FILE"

# The first argument must be a + delimited string to control a test loop simulating processing time
# e.g. "head+5+0.2+1+tail" will loop 5 times, sleep 0.2s on every loop and exit with code 1.
# The HEAD and TAIL values are discarded to allows usage of fully qualified file (inc. extension) as input value.
IFS=+ read HEAD COUNT SLEEP CODE TAIL <<< $1

for ((n=0;n<$COUNT;n++))
do
 echo $n
 sleep $SLEEP
done

exit $CODE

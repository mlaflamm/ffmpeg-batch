#! /bin/bash

OUT=${2//%/%%}

echo $1
echo $OUT

# first arg must be a dash delimited string to control a loop
# e.g. "5-0.2-1" will loop 5 times, sleep 0.2s on every loop and exit with code 1
IFS=+ read HEAD COUNT SLEEP CODE TAIL <<< $1

for ((n=0;n<$COUNT;n++))
do
 echo $n
 sleep $SLEEP
done

exit $CODE

// ALoDLM project page: Table 1 (main results) as data.
// GENERATED from the verified main_results.json by a build script; do not edit by hand.
// Marks: 'bold' = overall best within the scale, 'underline' = best non-AR within the scale.
window.ALODLM_RESULTS = {
 "source": "Table 1 of the paper (main results)",
 "caption": "<strong>Main results.</strong> We compare ALoDLM against its corresponding AR baseline and recent diffusion language models (DLMs). Within each model scale, the overall best results are in <strong>bold</strong>, and the best non-AR results are <u>underlined</u>. Columns corresponding to our model are shaded in blue.",
 "caption_rows": "<strong>Main results.</strong> We compare ALoDLM against its corresponding AR baseline and recent diffusion language models (DLMs). Within each model scale, the overall best results are in <strong>bold</strong>, and the best non-AR results are <u>underlined</u>. Rows corresponding to our model are shaded in blue.",
 "caption_plain": "Main results. We compare ALoDLM against its corresponding AR baseline and recent diffusion language models (DLMs). Within each model scale, the overall best results are in bold, and the best non-AR results are underlined. Columns corresponding to our model are shaded in blue.",
 "caption_plain_rows": "Main results. We compare ALoDLM against its corresponding AR baseline and recent diffusion language models (DLMs). Within each model scale, the overall best results are in bold, and the best non-AR results are underlined. Rows corresponding to our model are shaded in blue.",
 "columns": [
  "ARC-C",
  "ARC-E",
  "MMLU",
  "MMLU-Pro",
  "GSM8K",
  "MATH-500",
  "GPQA-Diamond",
  "MBPP",
  "MBPP+",
  "HumanEval",
  "HumanEval+",
  "Average"
 ],
 "column_display_html": {
  "ARC-C": "ARC-C",
  "ARC-E": "ARC-E",
  "MMLU": "MMLU",
  "MMLU-Pro": "MMLU-Pro",
  "GSM8K": "GSM8K",
  "MATH-500": "MATH-500",
  "GPQA-Diamond": "GPQA-Diamond",
  "MBPP": "MBPP",
  "MBPP+": "MBPP<sup>+</sup>",
  "HumanEval": "HumanEval",
  "HumanEval+": "HumanEval<sup>+</sup>",
  "Average": "Average"
 },
 "column_groups": [
  {
   "name": "General Reasoning",
   "columns": [
    "ARC-C",
    "ARC-E",
    "MMLU",
    "MMLU-Pro"
   ]
  },
  {
   "name": "Math & Science",
   "columns": [
    "GSM8K",
    "MATH-500",
    "GPQA-Diamond"
   ]
  },
  {
   "name": "Code Generation",
   "columns": [
    "MBPP",
    "MBPP+",
    "HumanEval",
    "HumanEval+"
   ]
  },
  {
   "name": "Average",
   "columns": [
    "Average"
   ]
  }
 ],
 "row_groups": [
  {
   "name": "1.7B scale",
   "rows": [
    {
     "model": "Qwen3",
     "size": "1.7B",
     "type": "AR",
     "type_label": "AR Baseline (Instruct Model)",
     "is_ours": false,
     "values": [
      82.4,
      90.0,
      60.3,
      39.0,
      83.2,
      72.0,
      31.3,
      61.9,
      58.5,
      62.8,
      60.4,
      63.8
     ],
     "values_text": [
      "82.4",
      "90.0",
      "60.3",
      "39.0",
      "83.2",
      "72.0",
      "31.3",
      "61.9",
      "58.5",
      "62.8",
      "60.4",
      "63.8"
     ],
     "marks": {
      "ARC-C": "bold",
      "ARC-E": "bold",
      "MATH-500": "bold"
     }
    },
    {
     "model": "SDAR",
     "size": "1.7B",
     "type": "DLM",
     "type_label": "DLM Baseline (Instruct Model)",
     "is_ours": false,
     "values": [
      74.9,
      86.5,
      63.4,
      37.0,
      80.1,
      62.4,
      32.3,
      60.3,
      59.4,
      61.6,
      53.0,
      61.0
     ],
     "values_text": [
      "74.9",
      "86.5",
      "63.4",
      "37.0",
      "80.1",
      "62.4",
      "32.3",
      "60.3",
      "59.4",
      "61.6",
      "53.0",
      "61.0"
     ],
     "marks": {
      "MMLU": "bold+underline",
      "MATH-500": "underline"
     }
    },
    {
     "model": "ALoDLM",
     "size": "1.7B",
     "type": "Ours",
     "type_label": "Ours (Instruct Model)",
     "is_ours": true,
     "values": [
      77.7,
      88.7,
      59.4,
      39.6,
      85.5,
      61.8,
      41.4,
      65.5,
      60.1,
      72.6,
      67.7,
      65.5
     ],
     "values_text": [
      "77.7",
      "88.7",
      "59.4",
      "39.6",
      "85.5",
      "61.8",
      "41.4",
      "65.5",
      "60.1",
      "72.6",
      "67.7",
      "65.5"
     ],
     "marks": {
      "ARC-C": "underline",
      "ARC-E": "underline",
      "MMLU-Pro": "bold+underline",
      "GSM8K": "bold+underline",
      "GPQA-Diamond": "bold+underline",
      "MBPP": "bold+underline",
      "MBPP+": "bold+underline",
      "HumanEval": "bold+underline",
      "HumanEval+": "bold+underline",
      "Average": "bold+underline"
     }
    }
   ]
  },
  {
   "name": "8B scale",
   "rows": [
    {
     "model": "Qwen3",
     "size": "8B",
     "type": "AR",
     "type_label": "AR Baseline (Instruct Model)",
     "is_ours": false,
     "values": [
      93.9,
      96.1,
      76.6,
      56.8,
      93.6,
      81.8,
      47.0,
      79.0,
      74.5,
      85.4,
      79.3,
      78.5
     ],
     "values_text": [
      "93.9",
      "96.1",
      "76.6",
      "56.8",
      "93.6",
      "81.8",
      "47.0",
      "79.0",
      "74.5",
      "85.4",
      "79.3",
      "78.5"
     ],
     "marks": {
      "MATH-500": "bold",
      "MBPP+": "bold"
     }
    },
    {
     "model": "LLaDA",
     "size": "8B",
     "type": "DLM",
     "type_label": "DLM Baseline (Instruct Model)",
     "is_ours": false,
     "values": [
      85.6,
      92.6,
      62.4,
      35.6,
      73.8,
      42.2,
      22.7,
      46.0,
      43.4,
      43.3,
      38.4,
      53.3
     ],
     "values_text": [
      "85.6",
      "92.6",
      "62.4",
      "35.6",
      "73.8",
      "42.2",
      "22.7",
      "46.0",
      "43.4",
      "43.3",
      "38.4",
      "53.3"
     ],
     "marks": {}
    },
    {
     "model": "Dream",
     "size": "7B",
     "type": "DLM",
     "type_label": "DLM Baseline (Instruct Model)",
     "is_ours": false,
     "values": [
      84.3,
      93.0,
      68.4,
      42.0,
      82.0,
      42.0,
      23.7,
      65.5,
      60.6,
      53.7,
      50.0,
      60.5
     ],
     "values_text": [
      "84.3",
      "93.0",
      "68.4",
      "42.0",
      "82.0",
      "42.0",
      "23.7",
      "65.5",
      "60.6",
      "53.7",
      "50.0",
      "60.5"
     ],
     "marks": {}
    },
    {
     "model": "Fast-dLLM-v2",
     "size": "7B",
     "type": "DLM",
     "type_label": "DLM Baseline (Instruct Model)",
     "is_ours": false,
     "values": [
      77.2,
      83.4,
      66.7,
      40.6,
      85.1,
      58.2,
      21.2,
      61.9,
      50.0,
      65.9,
      61.0,
      61.0
     ],
     "values_text": [
      "77.2",
      "83.4",
      "66.7",
      "40.6",
      "85.1",
      "58.2",
      "21.2",
      "61.9",
      "50.0",
      "65.9",
      "61.0",
      "61.0"
     ],
     "marks": {}
    },
    {
     "model": "SDAR",
     "size": "8B",
     "type": "DLM",
     "type_label": "DLM Baseline (Instruct Model)",
     "is_ours": false,
     "values": [
      90.0,
      93.4,
      78.5,
      56.3,
      91.4,
      77.0,
      38.4,
      72.0,
      67.9,
      78.0,
      73.2,
      74.2
     ],
     "values_text": [
      "90.0",
      "93.4",
      "78.5",
      "56.3",
      "91.4",
      "77.0",
      "38.4",
      "72.0",
      "67.9",
      "78.0",
      "73.2",
      "74.2"
     ],
     "marks": {
      "MMLU": "bold+underline"
     }
    },
    {
     "model": "WeDLM",
     "size": "8B",
     "type": "DLM",
     "type_label": "DLM Baseline (Instruct Model)",
     "is_ours": false,
     "values": [
      91.9,
      97.5,
      78.0,
      58.3,
      93.3,
      77.8,
      37.4,
      74.3,
      63.5,
      79.9,
      74.4,
      75.1
     ],
     "values_text": [
      "91.9",
      "97.5",
      "78.0",
      "58.3",
      "93.3",
      "77.8",
      "37.4",
      "74.3",
      "63.5",
      "79.9",
      "74.4",
      "75.1"
     ],
     "marks": {}
    },
    {
     "model": "ALoDLM",
     "size": "8B",
     "type": "Ours",
     "type_label": "Ours (Instruct Model)",
     "is_ours": true,
     "values": [
      94.4,
      98.1,
      76.6,
      63.9,
      94.2,
      80.8,
      49.5,
      81.5,
      72.5,
      87.8,
      84.2,
      80.3
     ],
     "values_text": [
      "94.4",
      "98.1",
      "76.6",
      "63.9",
      "94.2",
      "80.8",
      "49.5",
      "81.5",
      "72.5",
      "87.8",
      "84.2",
      "80.3"
     ],
     "marks": {
      "ARC-C": "bold+underline",
      "ARC-E": "bold+underline",
      "MMLU-Pro": "bold+underline",
      "GSM8K": "bold+underline",
      "MATH-500": "underline",
      "GPQA-Diamond": "bold+underline",
      "MBPP": "bold+underline",
      "MBPP+": "underline",
      "HumanEval": "bold+underline",
      "HumanEval+": "bold+underline",
      "Average": "bold+underline"
     }
    }
   ]
  }
 ],
 "mark_legend": {
  "bold": "overall best result within this model scale (AR baselines included)",
  "underline": "best non-AR result within this model scale",
  "bold+underline": "both: overall best and best non-AR within this model scale"
 }
};

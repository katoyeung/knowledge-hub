/* eslint-disable @typescript-eslint/no-explicit-any */
import { EditOutlined } from "@ant-design/icons";

import { Button, Card, Drawer, Select } from "antd";

import { getModelList } from "../../utils/models";
import { useEffect, useState } from "react";
import axios from "axios";
import { apiUrl } from "../../appConfig";

import { TOKEN_KEY, USER_KEY } from "../../authProvider";
import { EditPrompt } from "./edit-prompt";

const defaultPromptList = [
  {
    id: "default",
    title: "Default",
    prompt: `Extract the data from the following content:

{{content}}

Give me the result in JSON format, and only return the JSON. DO NOT ADD MARKUP, RETURN ONLY THE JSON.
	
Here is the JSON format:
{
	"Header": "string", // the header of the news
	"PublishedAt": "time.Time", // the date of the news
	"EventHappenDate": "time.Time", // the date of the event
	"ExpectedEndDate": "time.Time", // the expected end date of the event
	"VesselName": "string", // the name of the vessel
	"PortName": "string", // the name of the port
	"PortCode": "string", // the UNLOCODE of the port
	"Province": "string", // the province of the event
	"PotentialPortCode": "string", // the potential UNLOCODE port code of the event
	"CountryCode": "string", // the ISO2 country code of the event
	"Country": "string", // the country of the event
	"EventCategory": "string", // the category of the event
	"Summary": "string", // create a summary of the event
	"ImpactLevel": "string", // Measure the impact of the event to the different stakeholders in supply chain; Minor,Moderate,Major,Severe,Catastrophic
}

if a data is not found, please do not return the field.
Classify the news articles to following categories 
	- Port Strikes & Labor Unrest 
	- Accident Disruptions 
	- Weather & Natural Disasters 
	- Regulatory & Trade Policy Changes 
	- Economic & Market Trends 
	- Port Congestion & Delays 
	- Infrastructure & Capacity Expansion 
	- Geopolitical & Security Risks 
	- Customs & Border Delays 
	- Unclassified Disruptions 

here are explanation and examples for all fields:
| Data Field | Definition | Example |
|------------|------------|---------|
| News Published Date | When the news is published from the news source - Format as YYYY-MM-DD | 3/3/2025 |
| News Header | Header of the news - From news source - Paraphrase by AI model | ONE boxship collides with Maersk vessel in Hong Kong |
| Date of Event | When the event or instance was / will be happened - Typhoon - future - Vessel collision – historical - Format as YYYY-MM-DD | 3/1/2025 |
| Expected End Date | When the event or instance would be closed - If not mentioned in news source default as 14 days from event happen date | 3/15/2025 |
| Vessel Name | Identify the vessel name from the news article | ONE Columba Clifford Maersk |
| Port Name | Identify the port name from the news article | Modern Terminal Port |
| Port Code | Show the UNLOCODE of the port name | FRMRS |
| Province | Impacted area or province in the event | Marseille |
| Potential Port Code | List the relevant port code from the impacted area or province | FRMRS |
| Country Code | Show the ISO2 country code of the country name | FR |
| Country | Identify the country name from the news article | France |
| ImpactLevel | Measure the impact of the event to the different stakeholders in supply chain | Major | Minor,Moderate,Major,Severe,Catastrophic
| Event Category | Classify the news articles to following categories | - Port Strikes & Labor Unrest 
	- Accident Disruptions 
	- Weather & Natural Disasters 
	- Regulatory & Trade Policy Changes 
	- Economic & Market Trends 
	- Port Congestion & Delays 
	- Infrastructure & Capacity Expansion 
	- Geopolitical & Security Risks 
	- Customs & Border Delays 
	- Unclassified Disruptions 

For any dates, make sure to extract the correct, complete dates, containing the day, month and year. 
If the articles text refers to dates without detail, infer the complete date based on a publication, published date, or updated date stated clearly. 
For example a mention of "Published Mar 31, 2025 7:02 PM" should be extracted as "2025-03-31"
and then mentions of a text like "April 1st" should be extracted as "2025-04-01"

If you are unsure of the exact date. Then refer to the fact that we are currently in 2025 and all the news refer to recent events.

ImpactLevel should be taken as the impact of the even on the supply chain, and disruption to it for logistic companies. 
For example: Congestion at a port for 30min would be minor, Strike at a port would be moderate, Vessel collision would be major, a Pandemic would be severe, a global War would be catastrophic.
`,
  },
  // {
  //   id: "2",
  //   title: "Write a holiday/special occasion mail",
  //   prompt: "Write a ",
  // },
];

interface PostAnalyzeProps {
  open: boolean;
  onClose: () => void;
  record: any; // Replace 'any' with proper record type if available
}

export const PostAnalyze = ({ open, onClose, record }: PostAnalyzeProps) => {
  const [selectedModel, setSelectedModel] = useState(
    "qwen/qwen2.5-coder-7b-instruct"
  );

  const [result, setResult] = useState("");
  const [promptList, setPromptList] = useState(defaultPromptList);

  const [selectedPrompt, setSelectedPrompt] = useState(defaultPromptList[0]);

  const [isEditPromptOpened, setIsEditPromptOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const onChange = (value: string) => {
    console.log(`selected ${value}`);
    setSelectedModel(value);
  };

  const onSearch = (value: string) => {
    console.log("search:", value);
  };

  console.log("Selected Model", selectedModel);

  useEffect(() => {
    let user = localStorage.getItem(USER_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (user) {
      user = JSON.parse(user);
    }

    const config = {
      method: "get",
      maxBodyLength: Infinity,
      url: `${apiUrl}/prompts?filter=user.id||eq||${(user as any)?.id}`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    };

    axios
      .request(config)
      .then((response) => {
        console.log("Prompt created", response?.data);

        if (response?.data) {
          const promptList = [];
          promptList.push(defaultPromptList[0]);
          response?.data?.forEach(
            (item: { id: string; title: string; prompt: string }) => {
              promptList.push(item);
            }
          );
          setPromptList([...promptList]);
        }
      })
      .catch((error) => {
        console.log(error);
      });
  }, [isEditPromptOpened]);

  const analyzePost = () => {
    if (selectedModel && record?.id) {
      setResult("");
      setLoading(true);
      console.log("Record Id", selectedModel, record?.id);
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        let payload: any = {
          postId: record?.id,
          model: selectedModel,
        };
        if (selectedPrompt?.id && selectedPrompt?.id !== "default") {
          payload = {
            ...payload,
            promptId: selectedPrompt?.id,
          };
        }
        const data = JSON.stringify(payload);

        const config = {
          method: "post",
          maxBodyLength: Infinity,
          url: `${apiUrl}/posts/analyze-post`,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          data: data,
        };

        axios
          .request(config)
          .then((response) => {
            console.log(response?.data?.choices?.[0]?.message?.content);
            const parsedData = response?.data?.choices?.[0]?.message?.content;

            console.log("Parsed Data", parsedData);
            const jsonMatch = parsedData.match(/```json\s*([\s\S]*?)\s*```/);
            setResult(parsedData);
            setLoading(false);
          })
          .catch((error) => {
            console.log(error);
          });
      } catch (error) {
        return {
          success: false,
          error: {
            name: "LoginError",
            message:
              (error as { response?: { data?: { message?: string } } })
                ?.response?.data?.message || "Invalid username or password",
          },
        };
      }
    }
  };

  const containerStyle = {
    backgroundColor: "#141414",
    color: "white",
    padding: "16px",
    borderRadius: "8px",
    width: "100%",
    maxWidth: "32rem",
    marginTop: "10px",
  };

  const preStyle = {
    fontSize: "0.875rem",
    fontFamily: "monospace",
    overflow: "hidden",
    margin: 0,
  };

  const codeStyle = {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word" as const,
    maxWidth: "100%",
    display: "block",
  };

  return (
    <Drawer visible={open} onClose={onClose} width="700">
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              color: "#ccc",
              flex: "1 1 auto",
            }}
          >
            Model Configuration
          </div>
          {/* <EditOutlined style={{ cursor: "pointer" }} /> */}
        </div>

        <div style={{ width: "100%" }}>
          <Select
            showSearch
            placeholder="Select Model"
            optionFilterProp="label"
            onChange={onChange}
            onSearch={onSearch}
            options={getModelList()}
            value={selectedModel}
            style={{ width: "50%" }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "10px",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              color: "#ccc",
              flex: "1 1 auto",
            }}
          >
            Select Prompt
          </div>
          {/* <EditOutlined style={{ cursor: "pointer" }} /> */}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {promptList?.map((promptData) => {
            const getSelectedStyle = () => {
              if (promptData?.id === selectedPrompt?.id) {
                return {
                  color: "#3c89e8",
                  borderColor: "#3c89e8",
                };
              }
            };
            const styles = {
              container: {
                backgroundColor: "#1e1e1e",
                color: "#fff",
                borderRadius: "8px",
                fontSize: "10px",
                maxHeight: "600px",
                overflowY: "auto" as const,
                whiteSpace: "pre-wrap",
                lineHeight: "1.5",
                border: "1px solid #444",
                height: "40px",
                minWidth: "150px",
                maxWidth: "200px",
                padding: "10px",
                cursor: "pointer",
              },
            };
            return (
              <div
                style={{ ...styles.container, ...getSelectedStyle() }}
                onClick={() => {
                  setSelectedPrompt(promptData);
                }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      flex: "1 1 auto",
                    }}
                  >
                    {promptData?.title}
                  </div>
                  <EditOutlined
                    onClick={() => {
                      setIsEditPromptOpened(true);
                      setSelectedPrompt(promptData);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "20px" }}>
          <Button onClick={analyzePost} loading={loading}>
            Generate
          </Button>
        </div>
        {result && (
          <>
            <div
              style={{
                marginTop: "20px",
                fontSize: "12px",
                color: "#ccc",
                flex: "1 1 auto",
              }}
            >
              Result
            </div>
            <div style={containerStyle} className="containerStyle">
              <pre style={preStyle}>
                <code style={codeStyle}>{result}</code>
              </pre>
            </div>
          </>
        )}
      </div>
      {selectedPrompt && isEditPromptOpened && (
        <EditPrompt
          promptData={selectedPrompt}
          open={isEditPromptOpened}
          onClose={() => {
            setIsEditPromptOpened(false);
          }}
          setSelectedPrompt={setSelectedPrompt}
          defaultPrompt={defaultPromptList[0]}
        />
      )}
    </Drawer>
  );
};

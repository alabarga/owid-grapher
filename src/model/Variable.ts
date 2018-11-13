import {Entity, PrimaryGeneratedColumn, Column, BaseEntity, ManyToOne, JoinColumn} from "typeorm"
import * as _ from 'lodash'

import * as db from '../db'
import { Dataset } from './Dataset'
import { VariableDisplaySettings } from "../../js/charts/VariableData"

@Entity("variables")
export class Variable extends BaseEntity {
    @PrimaryGeneratedColumn() id!: number
    @Column() datasetId!: number
    @Column() name!: string
    @Column({ default: "" }) unit!: string
    @Column() description!: string
    @Column() columnOrder!: number
    @Column({ default: "{}", type: 'json' }) display!: VariableDisplaySettings

    @ManyToOne(type => Dataset, dataset => dataset.variables) @JoinColumn({ name: 'datasetId' })
    dataset!: Dataset
}

export async function getVariableData(variableIds: number[]): Promise<any> {
    const data: any = { variables: {}, entityKey: {} }

    const variableQuery = db.query(`
        SELECT
            v.*,
            v.shortUnit,
            d.name as datasetName,
            d.id as datasetId,
            s.id as sourceId,
            s.name as sourceName,
            s.description as sourceDescription
        FROM variables as v
        JOIN datasets as d ON v.datasetId = d.id
        JOIN sources as s on v.sourceId = s.id
        WHERE v.id IN (?)
    `, [variableIds])

    const dataQuery = db.query(`
        SELECT
            value,
            year,
            variableId as variableId,
            entities.id as entityId,
            entities.name as entityName,
            entities.code as entityCode
        FROM data_values
        LEFT JOIN entities ON data_values.entityId = entities.id
        WHERE data_values.variableId IN (?)
        ORDER BY variableId ASC, year ASC
    `, [variableIds])

    const variables = await variableQuery

    for (const row of variables) {
        row.display = JSON.parse(row.display)
        const sourceDescription = JSON.parse(row.sourceDescription)
        row.source = {
            id: row.sourceId,
            name: row.sourceName,
            dataPublishedBy: sourceDescription.dataPublishedBy || "",
            dataPublisherSource: sourceDescription.dataPublisherSource || "",
            link: sourceDescription.link || "",
            retrievedData: sourceDescription.retrievedData || "",
            additionalInfo: sourceDescription.additionalInfo || ""
        }
        delete row.sourceDescription
        delete row.sourceId
        delete row.sourceName
        data.variables[row.id] = _.extend({
            years: [],
            entities: [],
            values: []
        }, row)
    }

    const results = await dataQuery

    for (const row of results) {
        const variable = data.variables[row.variableId]
        variable.years.push(row.year)
        variable.entities.push(row.entityId)

        const asNumber = parseFloat(row.value)
        if (!isNaN(asNumber))
            variable.values.push(asNumber)
        else
            variable.values.push(row.value)

        if (data.entityKey[row.entityId] === undefined) {
            data.entityKey[row.entityId] = { name: row.entityName, code: row.entityCode }
        }
    }

    return data
}

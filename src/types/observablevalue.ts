import {
    Atom,
    IEnhancer,
    IInterceptable,
    IInterceptor,
    IListenable,
    Lambda,
    checkIfStateModificationsAreAllowed,
    createInstanceofPredicate,
    getNextId,
    hasInterceptors,
    hasListeners,
    interceptChange,
    isSpyEnabled,
    notifyListeners,
    registerInterceptor,
    registerListener,
    spyReport,
    spyReportEnd,
    spyReportStart,
    toPrimitive
} from "../internal"

export interface IValueWillChange<T> {
    object: any
    type: "update"
    newValue: T
}

export interface IValueDidChange<T> extends IValueWillChange<T> {
    oldValue: T | undefined
}

export type IUNCHANGED = {}

export const UNCHANGED: IUNCHANGED = {}

export interface IObservableValue<T> {
    get(): T
    set(value: T): void
    intercept(handler: IInterceptor<IValueWillChange<T>>): Lambda
    observe(listener: (change: IValueDidChange<T>) => void, fireImmediately?: boolean): Lambda
}

export class ObservableValue<T> extends Atom
    implements IObservableValue<T>, IInterceptable<IValueWillChange<T>>, IListenable {
    hasUnreportedChange = false
    interceptors
    changeListeners
    value
    dehancer: any

    constructor(
        value: T,
        public enhancer: IEnhancer<T>,
        name = "ObservableValue@" + getNextId(),
        notifySpy = true
    ) {
        super(name)
        this.value = enhancer(value, undefined, name)
        if (notifySpy && isSpyEnabled() && process.env.NODE_ENV !== "production") {
            // only notify spy if this is a stand-alone observable
            spyReport({ type: "create", name: this.name, newValue: "" + this.value })
        }
    }

    dehanceValue(value: T): T {
        if (this.dehancer !== undefined) return this.dehancer(value)
        return value
    }

    public set(newValue: T) {
        const oldValue = this.value
        newValue = this.prepareNewValue(newValue) as any
        if (newValue !== UNCHANGED) {
            const notifySpy = isSpyEnabled()
            if (notifySpy && process.env.NODE_ENV !== "production") {
                spyReportStart({
                    type: "update",
                    name: this.name,
                    newValue,
                    oldValue
                })
            }
            this.setNewValue(newValue)
            if (notifySpy && process.env.NODE_ENV !== "production") spyReportEnd()
        }
    }

    prepareNewValue(newValue): T | IUNCHANGED {
        checkIfStateModificationsAreAllowed(this)
        if (hasInterceptors(this)) {
            const change = interceptChange<IValueWillChange<T>>(this, {
                object: this,
                type: "update",
                newValue
            })
            if (!change) return UNCHANGED
            newValue = change.newValue
        }
        // apply modifier
        newValue = this.enhancer(newValue, this.value, this.name)
        return this.value !== newValue ? newValue : UNCHANGED
    }

    setNewValue(newValue: T) {
        const oldValue = this.value
        this.value = newValue
        this.reportChanged()
        if (hasListeners(this)) {
            notifyListeners(this, {
                type: "update",
                object: this,
                newValue,
                oldValue
            })
        }
    }

    public get(): T {
        this.reportObserved()
        return this.dehanceValue(this.value)
    }

    public intercept(handler: IInterceptor<IValueWillChange<T>>): Lambda {
        return registerInterceptor(this, handler)
    }

    public observe(
        listener: (change: IValueDidChange<T>) => void,
        fireImmediately?: boolean
    ): Lambda {
        if (fireImmediately)
            listener({
                object: this,
                type: "update",
                newValue: this.value,
                oldValue: undefined
            })
        return registerListener(this, listener)
    }

    toJSON() {
        return this.get()
    }

    toString() {
        return `${this.name}[${this.value}]`
    }

    valueOf(): T {
        return toPrimitive(this.get())
    }

    [Symbol.toPrimitive]() {
        return this.valueOf()
    }
}

export var isObservableValue = createInstanceofPredicate("ObservableValue", ObservableValue) as (
    x: any
) => x is IObservableValue<any>
